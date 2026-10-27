// Admin test access, per-day routes, navigation, editing a task
import { T } from './i18n.js';
Object.assign(T.de, {
  testTitle:'Mitarbeiter-Ansicht öffnen', testHint:'Ohne SMS-Code: öffnet die Ansicht eines Test-Mitarbeiters (Aufträge zuteilen, annehmen, laufen, Navigation). Zurück zum Admin über „Profil“.',
  testOwn:'Mit meiner Nummer öffnen', testCreate:'Neuen Test-Mitarbeiter anlegen', testWorkerName:'Test-Mitarbeiter',
  editTask:'Auftrag bearbeiten', replan:'Flyer / Mitarbeiter / Routen neu planen', editNoReplan:'Neu planen geht nur, solange noch niemand gelaufen ist. Texte, Datum und Quote kannst du trotzdem ändern.', close:'Schließen',
  startDayN:'Tag {n} starten', dayDone:'Tag {n} ist geschafft – zurück zum Start.', dayStatus:'Heute: Tag {n}', navOpen:'Navigation',
  navStart:'Folge der Linie', navS:'Geradeaus weiter', navSL:'Leicht links', navSR:'Leicht rechts', navL:'Links abbiegen', navR:'Rechts abbiegen', navU:'Wenden', navEnd:'Ende der Route – zurück am Startpunkt',
  sugWorkers:'Empfehlung: {n} Mitarbeiter, damit alles in {d} Tagen fertig wird.', applySug:'Übernehmen',
  changeStart:'Startpunkt ändern', pickStartNow:'Neuen Startpunkt auf der Karte antippen · Abbrechen',
  navIn:'In {d}', navOnto:'auf {name}', navAhead:'Weiter auf {name}', navOff:'Abseits der Route ({d})', navExt:'In Karten-App öffnen', navThen:'Danach: {s}',
});
Object.assign(T.ru, {
  testTitle:'Открыть панель работника', testHint:'Без SMS-кода: открывает вид тестового работника (получить задание, принять, идти по маршруту, навигация). Назад в админку — через «Профиль».',
  testOwn:'Открыть с моим номером', testCreate:'Создать нового тестового работника', testWorkerName:'Тест-работник',
  editTask:'Редактировать заказ', replan:'Пересчитать флаеры / работников / маршруты', editNoReplan:'Пересчитать можно, пока никто не ходил. Тексты, дату и квоту менять можно всегда.', close:'Закрыть',
  startDayN:'Начать день {n}', dayDone:'День {n} закончен — возвращайтесь на старт.', dayStatus:'Сегодня: день {n}', navOpen:'Навигация',
  navStart:'Идите по линии', navS:'Прямо', navSL:'Чуть левее', navSR:'Чуть правее', navL:'Налево', navR:'Направо', navU:'Развернуться', navEnd:'Конец маршрута — вы у точки старта',
  sugWorkers:'Рекомендуем {n} работников, чтобы уложиться в {d} дн.', applySug:'Принять',
  changeStart:'Изменить старт', pickStartNow:'Нажмите на карту — новый старт · Отмена',
  navIn:'Через {d}', navOnto:'на {name}', navAhead:'Дальше по {name}', navOff:'Вы вне маршрута ({d})', navExt:'Открыть в приложении карт', navThen:'Затем: {s}',
});
