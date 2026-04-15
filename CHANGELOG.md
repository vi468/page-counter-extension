# Changelog

Формат: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), версионирование: [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-04-15

Первый MVP.

### Added
- Модель Counter со scope: `tab` / `domain` / `url` / `global`. Дефолт — `domain`.
- Попап со списком счётчиков, релевантных текущей странице: +/-, ручной ввод значения, переименование.
- Primary-счётчик per scope-контекст, его значение отображается в badge иконки.
- Контекстное меню счётчика: сделать главным, переименовать, задать значение, изменить initial/step, reset, удалить.
- Настройки: дефолтный scope, поведение клика ЛКМ по иконке (`+N` или открыть попап), шаг клика.
- Хоткеи `Alt+↑` / `Alt+↓` / `Alt+0` (reset).
- Экспорт / импорт счётчиков и настроек в JSON.
- Автоочистка tab-scoped счётчиков при закрытии вкладки.
- Live-обновление попапа при изменениях в storage.

### Technical
- Manifest V3, service worker как ES-module.
- Хранилище — `chrome.storage.local`.
- Без сборщика, чистый JS + HTML + CSS.

[Unreleased]: https://github.com/vi468/page-counter-extension/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vi468/page-counter-extension/releases/tag/v0.1.0
