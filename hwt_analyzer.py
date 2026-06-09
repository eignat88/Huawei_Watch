#!/usr/bin/env python3
"""Analyze Huawei .hwt watch-face archives and export image/coordinate reports."""
from __future__ import annotations

import csv
import json
import shutil
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import tkinter as tk
from tkinter import filedialog, messagebox

from PIL import Image

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
CONFIG_EXT = {".xml", ".json", ".ini", ".txt", ".watch"}
ZIP_SIGNATURE = b"PK\x03\x04"
MAX_NESTED_ARCHIVE_DEPTH = 3

HAND_KEYWORDS = {
    "hour": ["hour", "hours", "h_", "_h", "shi", "时", "hh"],
    "minute": ["minute", "minutes", "min", "m_", "_m", "fen", "分", "mm"],
    "second": ["second", "seconds", "sec", "s_", "_s", "miao", "秒", "ss"],
}

BACKGROUND_KEYWORDS = [
    "background",
    "bg",
    "dial",
    "face",
    "preview",
    "watchface",
    "watch_face",
]

IMAGE_REF_KEYS = {"src", "source", "image", "img", "file", "filename", "path", "res", "resource"}
X_KEYS = {"x", "left", "posx", "positionx"}
Y_KEYS = {"y", "top", "posy", "positiony"}
CENTER_X_KEYS = {"centerx", "center_x", "cx", "pivotx", "pivot_x"}
CENTER_Y_KEYS = {"centery", "center_y", "cy", "pivoty", "pivot_y"}
ROTATION_X_KEYS = {"rotationx", "rotatex", "pivotx", "pivot_x"}
ROTATION_Y_KEYS = {"rotationy", "rotatey", "pivoty", "pivot_y"}

IMAGE_REPORT_FIELDS = [
    "source_path",
    "saved_file",
    "format",
    "width",
    "height",
    "size_kb",
    "detected_role",
    "x",
    "y",
    "center_x",
    "center_y",
    "rotation_x",
    "rotation_y",
    "config_file",
    "config_element",
    "raw_config",
]

POSITION_REPORT_FIELDS = [
    "config_file",
    "element",
    "image_ref",
    "x",
    "y",
    "center_x",
    "center_y",
    "rotation_x",
    "rotation_y",
    "raw_attributes",
]


HAND_LAYER_SEARCH_KEYWORDS = [
    "Hand Res",
    "HandRes",
    "Second Ratio",
    "Minute Ratio",
    "Hour 12 Ratio",
    "Hour Ratio",
    "Rotate Point",
    "HandRes Position",
    "SecondRatio",
    "MinuteRatio",
    "Hour12Ratio",
    "second",
    "minute",
    "hour",
    "selected res",
]

HAND_LAYER_SEARCH_ENCODINGS = [
    "utf-8",
    "utf-8-sig",
    "utf-16",
    "utf-16-le",
    "utf-16-be",
    "gbk",
    "latin-1",
]

HAND_LAYER_REPORT_FIELDS = [
    "file",
    "found_keywords",
    "preview",
]


def safe_filename(name: str) -> str:
    """Return a filesystem-safe flat filename for an archive-relative path."""
    return (
        name.replace("/", "_")
        .replace("\\", "_")
        .replace(":", "_")
        .replace("*", "_")
        .replace("?", "_")
        .replace('"', "_")
        .replace("<", "_")
        .replace(">", "_")
        .replace("|", "_")
    )


def choose_hwt_file() -> Path | None:
    """Open a file picker and return the selected .hwt path, if any."""
    root = tk.Tk()
    root.withdraw()

    file_path = filedialog.askopenfilename(
        title="Выберите HWT файл",
        filetypes=[("Huawei Watch Face", "*.hwt"), ("All files", "*.*")],
    )

    root.destroy()
    if not file_path:
        return None

    return Path(file_path)


def _safe_extract(archive: zipfile.ZipFile, output_dir: Path) -> None:
    """Extract an archive while rejecting paths that escape the output folder."""
    output_root = output_dir.resolve()

    for member in archive.infolist():
        target = (output_dir / member.filename).resolve()
        if target != output_root and output_root not in target.parents:
            raise ValueError(f"Unsafe archive member path: {member.filename}")

    archive.extractall(output_dir)


def is_zip_file(file_path: Path) -> bool:
    """Return whether a file starts with a ZIP local-file header signature."""
    try:
        with open(file_path, "rb") as file:
            return file.read(4) == ZIP_SIGNATURE
    except Exception:
        return False


def unpack_zip_file(zip_path: Path, output_dir: Path) -> None:
    """Safely extract a ZIP-compatible archive to the requested output folder."""
    output_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as archive:
        _safe_extract(archive, output_dir)


def unpack_nested_archives(output_dir: Path, max_depth: int = MAX_NESTED_ARCHIVE_DEPTH) -> list[Path]:
    """Extract nested ZIP-compatible files such as ``com.huawei.watchface``.

    Huawei ``.hwt`` packages can contain a second archive without a ``.zip``
    extension. Extracting it into ``<archive_name>_unpacked`` exposes the real
    ``watchface/res`` resources for image and coordinate analysis.
    """
    extracted_dirs: list[Path] = []
    processed_archives: set[Path] = set()

    for _depth in range(max_depth):
        nested_archives = [
            file_path
            for file_path in output_dir.rglob("*")
            if file_path.is_file()
            and file_path.resolve() not in processed_archives
            and is_zip_file(file_path)
        ]

        if not nested_archives:
            break

        for nested_archive in nested_archives:
            processed_archives.add(nested_archive.resolve())
            nested_output = nested_archive.with_name(nested_archive.name + "_unpacked")

            if nested_output.exists():
                shutil.rmtree(nested_output)

            try:
                unpack_zip_file(nested_archive, nested_output)
            except zipfile.BadZipFile:
                if nested_output.exists():
                    shutil.rmtree(nested_output)
                print(f"Не удалось распаковать вложенный архив {nested_archive}: файл не является ZIP")
                continue

            extracted_dirs.append(nested_output)
            print(f"Распакован вложенный архив: {nested_archive}")

    return extracted_dirs


def unpack_hwt(hwt_path: Path) -> Path:
    """Unpack a .hwt archive and ZIP-like nested watch-face archives."""
    output_dir = hwt_path.with_name(hwt_path.stem + "_unpacked")

    if output_dir.exists():
        shutil.rmtree(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    unpack_zip_file(hwt_path, output_dir)
    unpack_nested_archives(output_dir)

    return output_dir


def read_image_info(image_path: Path) -> dict[str, str | int]:
    """Read basic image metadata with Pillow."""
    try:
        with Image.open(image_path) as img:
            return {"format": img.format or "UNKNOWN", "width": img.width, "height": img.height}
    except Exception:
        return {"format": "UNKNOWN", "width": "", "height": ""}


def detect_role_by_name(file_name: str, width: int | None = None, height: int | None = None) -> str:
    """Guess an image role from path keywords and dimensions."""
    name = file_name.lower()
    basename = Path(file_name.replace("\\", "/")).name.lower()

    for role, keywords in HAND_KEYWORDS.items():
        for keyword in keywords:
            if keyword in name:
                if role == "hour":
                    return "hour_hand"
                if role == "minute":
                    return "minute_hand"
                if role == "second":
                    return "second_hand"

    for keyword in BACKGROUND_KEYWORDS:
        if keyword in basename:
            return "dial_or_background"

    if width and height:
        if width >= 400 and height >= 400:
            return "possible_full_size_resource"

        if height >= width * 3:
            return "possible_vertical_hand"

        if width >= height * 3:
            return "possible_horizontal_hand"

    return "unknown"


def find_config_files(unpacked_dir: Path) -> list[Path]:
    """Find text-like configuration files that may contain image positions."""
    return [
        file_path
        for file_path in unpacked_dir.rglob("*")
        if file_path.is_file() and file_path.suffix.lower() in CONFIG_EXT
    ]


def relative_or_name(file_path: Path, root_dir: Path | None = None) -> str:
    """Return a stable report path relative to the unpacked project when possible."""
    if root_dir is None:
        return file_path.name

    try:
        return str(file_path.relative_to(root_dir))
    except ValueError:
        return file_path.name


def parse_xml_for_positions(xml_path: Path, root_dir: Path | None = None) -> list[dict[str, Any]]:
    """Extract image references and coordinates from XML attributes."""
    result: list[dict[str, Any]] = []

    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except Exception:
        return result

    for elem in root.iter():
        attrs = elem.attrib

        if not attrs:
            continue

        row: dict[str, Any] = {
            "config_file": relative_or_name(xml_path, root_dir),
            "element": elem.tag,
            "raw_attributes": str(attrs),
            "image_ref": "",
            "x": "",
            "y": "",
            "center_x": "",
            "center_y": "",
            "rotation_x": "",
            "rotation_y": "",
        }

        for key, value in attrs.items():
            key_lower = key.lower()

            if key_lower in IMAGE_REF_KEYS:
                row["image_ref"] = value
            if key_lower in X_KEYS:
                row["x"] = value
            if key_lower in Y_KEYS:
                row["y"] = value
            if key_lower in CENTER_X_KEYS:
                row["center_x"] = value
            if key_lower in CENTER_Y_KEYS:
                row["center_y"] = value
            if key_lower in ROTATION_X_KEYS:
                row["rotation_x"] = value
            if key_lower in ROTATION_Y_KEYS:
                row["rotation_y"] = value

        if row["image_ref"] or row["x"] or row["y"] or row["center_x"] or row["center_y"]:
            result.append(row)

    return result


def _first_value(obj: dict[Any, Any], keys: dict[str, Any], candidates: list[str]) -> Any:
    for candidate in candidates:
        original_key = keys.get(candidate)
        if original_key is not None:
            return obj.get(original_key, "")
    return ""


def parse_json_for_positions(json_path: Path, root_dir: Path | None = None) -> list[dict[str, Any]]:
    """Extract image references and coordinates from JSON objects."""
    result: list[dict[str, Any]] = []

    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception:
        try:
            data = json.loads(json_path.read_text(encoding="utf-8-sig"))
        except Exception:
            return result

    def walk(obj: Any, parent_key: str = "") -> None:
        if isinstance(obj, dict):
            keys = {str(k).lower(): k for k in obj.keys()}

            image_key = None
            for candidate in IMAGE_REF_KEYS:
                if candidate in keys:
                    image_key = keys[candidate]
                    break

            has_position = any(
                k in keys
                for k in [
                    "x",
                    "y",
                    "left",
                    "top",
                    "centerx",
                    "centery",
                    "center_x",
                    "center_y",
                    "pivotx",
                    "pivoty",
                    "pivot_x",
                    "pivot_y",
                ]
            )

            if image_key or has_position:
                result.append(
                    {
                        "config_file": relative_or_name(json_path, root_dir),
                        "element": parent_key,
                        "raw_attributes": str(obj),
                        "image_ref": str(obj.get(image_key, "")) if image_key else "",
                        "x": _first_value(obj, keys, ["x", "left"]),
                        "y": _first_value(obj, keys, ["y", "top"]),
                        "center_x": _first_value(obj, keys, ["centerx", "center_x", "pivotx", "pivot_x"]),
                        "center_y": _first_value(obj, keys, ["centery", "center_y", "pivoty", "pivot_y"]),
                        "rotation_x": _first_value(obj, keys, ["rotationx", "rotatex"]),
                        "rotation_y": _first_value(obj, keys, ["rotationy", "rotatey"]),
                    }
                )

            for key, value in obj.items():
                walk(value, str(key))

        elif isinstance(obj, list):
            for index, item in enumerate(obj):
                walk(item, f"{parent_key}[{index}]")

    walk(data)

    return result


def search_hand_layers_in_files(unpacked_dir: Path) -> list[dict[str, str]]:
    """Search every non-image project file for Huawei hand-layer marker text."""
    result: list[dict[str, str]] = []

    for file_path in unpacked_dir.rglob("*"):
        if not file_path.is_file():
            continue

        if file_path.suffix.lower() in IMAGE_EXT:
            continue

        try:
            data = file_path.read_bytes()
        except Exception:
            continue

        text = None
        for encoding in HAND_LAYER_SEARCH_ENCODINGS:
            try:
                text = data.decode(encoding, errors="ignore")
                break
            except Exception:
                continue

        if not text:
            continue

        text_lower = text.lower()
        found = [
            keyword
            for keyword in HAND_LAYER_SEARCH_KEYWORDS
            if keyword.lower() in text_lower
        ]

        if found:
            result.append(
                {
                    "file": str(file_path.relative_to(unpacked_dir)),
                    "found_keywords": ", ".join(found),
                    "preview": text[:1000].replace("\n", " ").replace("\r", " "),
                }
            )

    return result


def save_hand_search_report(rows: list[dict[str, str]], output_file: Path) -> None:
    """Save hand-layer text search matches to a dedicated CSV report."""
    with open(output_file, "w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=HAND_LAYER_REPORT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def collect_images(unpacked_dir: Path) -> tuple[list[dict[str, Any]], Path]:
    """Copy images to a flat output folder and build image-report rows."""
    rows: list[dict[str, Any]] = []

    images_dir = unpacked_dir.with_name(unpacked_dir.name + "_images")
    if images_dir.exists():
        shutil.rmtree(images_dir)
    images_dir.mkdir(parents=True, exist_ok=True)

    for image_path in unpacked_dir.rglob("*"):
        if not image_path.is_file():
            continue

        if image_path.suffix.lower() not in IMAGE_EXT:
            continue

        info = read_image_info(image_path)

        relative_path = image_path.relative_to(unpacked_dir)
        saved_name = safe_filename(str(relative_path))
        saved_path = images_dir / saved_name

        shutil.copy2(image_path, saved_path)

        role = detect_role_by_name(
            file_name=str(relative_path),
            width=info["width"] if isinstance(info["width"], int) else None,
            height=info["height"] if isinstance(info["height"], int) else None,
        )

        rows.append(
            {
                "source_path": str(relative_path),
                "saved_file": saved_name,
                "format": info["format"],
                "width": info["width"],
                "height": info["height"],
                "size_kb": round(image_path.stat().st_size / 1024, 2),
                "detected_role": role,
                "x": "",
                "y": "",
                "center_x": "",
                "center_y": "",
                "rotation_x": "",
                "rotation_y": "",
                "config_file": "",
                "config_element": "",
                "raw_config": "",
            }
        )

    return rows, images_dir


def merge_positions_into_images(
    image_rows: list[dict[str, Any]], position_rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Attach matching coordinate rows to collected image rows."""
    for image_row in image_rows:
        source_name = image_row["source_path"].replace("\\", "/").lower()
        saved_name = image_row["saved_file"].lower()

        for pos in position_rows:
            image_ref = str(pos.get("image_ref", "")).replace("\\", "/").lower()

            if not image_ref:
                continue

            image_ref_name = Path(image_ref).name.lower()
            if image_ref in source_name or image_ref_name in source_name or image_ref_name in saved_name:
                image_row["x"] = pos.get("x", "")
                image_row["y"] = pos.get("y", "")
                image_row["center_x"] = pos.get("center_x", "")
                image_row["center_y"] = pos.get("center_y", "")
                image_row["rotation_x"] = pos.get("rotation_x", "")
                image_row["rotation_y"] = pos.get("rotation_y", "")
                image_row["config_file"] = pos.get("config_file", "")
                image_row["config_element"] = pos.get("element", "")
                image_row["raw_config"] = pos.get("raw_attributes", "")

                break

    return image_rows


def save_csv(rows: list[dict[str, Any]], output_file: Path) -> None:
    """Save the main image analysis CSV."""
    with open(output_file, "w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=IMAGE_REPORT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def save_positions_csv(rows: list[dict[str, Any]], output_file: Path) -> None:
    """Save the extracted coordinate CSV."""
    with open(output_file, "w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=POSITION_REPORT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def analyze_hwt(hwt_path: Path) -> dict[str, Any]:
    """Analyze a .hwt archive and return generated artifact paths and counters."""
    unpacked_dir = unpack_hwt(hwt_path)

    image_rows, images_dir = collect_images(unpacked_dir)
    config_files = find_config_files(unpacked_dir)

    position_rows: list[dict[str, Any]] = []

    for config_file in config_files:
        suffix = config_file.suffix.lower()

        if suffix == ".xml":
            position_rows.extend(parse_xml_for_positions(config_file, unpacked_dir))
        elif suffix == ".json":
            position_rows.extend(parse_json_for_positions(config_file, unpacked_dir))

    merged_rows = merge_positions_into_images(image_rows, position_rows)
    hand_search_rows = search_hand_layers_in_files(unpacked_dir)

    report_file = unpacked_dir / "hwt_analysis_report.csv"
    positions_file = unpacked_dir / "hwt_positions_report.csv"
    hand_search_file = unpacked_dir / "hwt_hand_layers_search.csv"

    save_csv(merged_rows, report_file)
    save_positions_csv(position_rows, positions_file)
    save_hand_search_report(hand_search_rows, hand_search_file)

    return {
        "unpacked_dir": unpacked_dir,
        "images_dir": images_dir,
        "report_file": report_file,
        "positions_file": positions_file,
        "hand_search_file": hand_search_file,
        "images_count": len(image_rows),
        "configs_count": len(config_files),
        "positions_count": len(position_rows),
        "hand_search_count": len(hand_search_rows),
    }


def main() -> int:
    hwt_path = choose_hwt_file()

    if not hwt_path:
        return 0

    try:
        result = analyze_hwt(hwt_path)

        messagebox.showinfo(
            "Готово",
            "Анализ HWT завершён.\n\n"
            f"Картинок найдено: {result['images_count']}\n"
            f"Конфигов найдено: {result['configs_count']}\n"
            f"Элементов с координатами найдено: {result['positions_count']}\n"
            f"Файлов с признаками стрелок найдено: {result['hand_search_count']}\n\n"
            f"Распакованный проект:\n{result['unpacked_dir']}\n\n"
            f"Картинки:\n{result['images_dir']}\n\n"
            f"Основной отчёт:\n{result['report_file']}\n\n"
            f"Отчёт по координатам:\n{result['positions_file']}\n\n"
            f"Поиск слоёв стрелок:\n{result['hand_search_file']}",
        )

    except zipfile.BadZipFile:
        messagebox.showerror("Ошибка", "Файл .hwt не удалось открыть как ZIP-архив.")
        return 1

    except Exception as exc:
        messagebox.showerror("Ошибка", str(exc))
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
