# Tools

В этом каталоге находятся вспомогательные команды для проверки проекта и донорских `.hwt` файлов.

## Проверка донорского `.hwt`

```bash
python3 tools/inspect_hwt.py assets/hwt/hugo_boss_black.gt-312881-fd38ad7b33.hwt
```

Скрипт проверяет:

- существует ли файл;
- определяется ли он как ZIP-архив;
- какие файлы лежат внутри;
- присутствуют ли `description.xml`, `preview/cover.jpg`, `preview/icon_small.jpg` и `com.huawei.watchface`.

## Сборка финального файла

Финальный `.hwt` не собирается автоматически этим репозиторием. После успешного экспорта из Huawei Watch Face Designer, Facemaker или HWT Tools положите файл в:

```text
dist/huawei_gt5pro_hugo_style.hwt
```
