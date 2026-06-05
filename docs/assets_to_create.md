# Файлы, которые нужно создать отдельно

В репозитории намеренно не хранятся бинарные файлы (`.png`, `.jpg`, `.pdf`, `.hwt`). Их нужно подготовить локально и положить в указанные каталоги перед сборкой.

## Убранные бинарные файлы

Из репозитория удалены следующие бинарные файлы:

| Файл | Назначение | Что сделать вместо него |
| --- | --- | --- |
| `assets/source/hugo_reference.jpg` | исходный/референсный JPG | подготовить локальный референс 466×466 или исходник дизайна |
| `assets/generated/huawei_gt5pro_hugo_style_watchface_466.png` | основной PNG циферблата | сгенерировать финальный PNG 466×466 |
| `assets/generated/huawei_gt5pro_hugo_style_gallery_466.jpg` | JPG для галереи/preview | экспортировать JPG 466×466 из основного макета |
| `project/watchface/res/background.png` | фон/ресурс проекта | скопировать или экспортировать PNG 466×466 для сборщика |
| `project/preview/cover.jpg` | крупное превью | экспортировать JPG-preview, обычно 466×466 |
| `project/preview/icon_small.jpg` | малая иконка preview | экспортировать малую JPG-иконку, например 160×160 |
| `docs/Huawei_Watch_Face_Development_Guide.pdf` | PDF-документация Huawei | добавить официальный PDF локально при необходимости |

## Файлы, которые нужно сделать для сборки

Минимальный набор для следующего этапа:

```text
assets/source/hugo_reference.jpg
assets/generated/huawei_gt5pro_hugo_style_watchface_466.png
assets/generated/huawei_gt5pro_hugo_style_gallery_466.jpg
project/watchface/res/background.png
project/preview/cover.jpg
project/preview/icon_small.jpg
assets/hwt/hugo_boss_black.gt-312881-fd38ad7b33.hwt
```

Опционально:

```text
docs/Huawei_Watch_Face_Development_Guide.pdf
dist/huawei_gt5pro_hugo_style.hwt
```

## Требования к изображениям

- Основной циферблат: `466×466 px`, круглый дизайн внутри квадратного PNG.
- Gallery/cover: желательно `466×466 px`, JPG без кириллицы и пробелов в имени.
- `icon_small.jpg`: малое preview, допустимо меньше 466×466, например `160×160 px`.
- Имена файлов должны оставаться латиницей, без пробелов, кириллицы и китайских символов.

## Почему бинарные файлы убраны

- Упрощается ревью изменений в Git.
- Репозиторий остается легким.
- Реальные `.hwt`, изображения и PDF можно хранить локально, в релизах GitHub или через Git LFS, если это потребуется.
