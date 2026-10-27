// Admin test access, per-day routes, navigation, editing a task
import { T } from './i18n.js';
Object.assign(T.de, {
  testTitle:'Mitarbeiter-Ansicht öffnen', testHint:'Ohne SMS-Code: öffnet die Ansicht eines Test-Mitarbeiters (Aufträge zuteilen, annehmen, laufen, Navigation). Zurück zum Admin über „Profil“.',
  testOwn:'Mit meiner Nummer öffnen', testCreate:'Neuen Test-Mitarbeiter anlegen', testWorkerName:'Test-Mitarbeiter',
  editTask:'Auftrag bearbeiten', replan:'Flyer / Mitarbeiter / Routen neu planen', editNoReplan:'Neu planen geht nur, solange noch niemand gelaufen ist. Texte, Datum und Quote kannst du trotzdem ändern.', close:'Schließen',
  startDayN:'Tag {n} starten', dayDone:'Tag {n} ist geschafft – zurück zum Start.', dayStatus:'Heute: Tag {n}', navOpen:'Navigation',
  navStart:'Folge der Linie', navS:'Geradeaus weiter', navSL:'Leicht links', navSR:'Leicht rechts', navL:'Links abbiegen', navR:'Rechts abbiegen', navU:'Wenden', navEnd:'Ende der Route – zurück am Startpunkt',
  sugWorkers:'Empfehlung: {n} Mitarbeiter, damit alles in {d} Tagen fertig wird.', applySug:'Übernehmen',
  startCheck:'Startpunkt prüfen', startLocating:'Position wird bestimmt …', notAtStart:'Noch nicht am Startpunkt', startTooFar:'Du bist {d} vom Startpunkt entfernt. Der Arbeitstag startet erst am Startpunkt (bis {r}).', startNoGps:'Die Position konnte nicht bestimmt werden. Standort einschalten und nochmal prüfen.', toStart:'Weg zum Startpunkt', checkAgain:'Nochmal prüfen', startAnyway:'Trotzdem starten (Test)',
  workedWhen:'Wer hat wann und wo gearbeitet', dToday:'Heute', dYesterday:'Gestern', d7:'7 Tage', workedSum:'{w} Mitarbeiter · {d}', filtered:'Filter aktiv', showAllDays:'alle Tage zeigen',
  workDays:'Arbeitstage', daysSum:'{n} Tage · {km} · {h} Std.', noDays:'Noch keine Arbeitstage.', noDaysRange:'Keine Arbeitstage für diesen Filter.',
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
  startCheck:'Проверка точки старта', startLocating:'Определяем местоположение…', notAtStart:'Вы ещё не на точке старта', startTooFar:'Вы в {d} от точки старта. Рабочий день начинается только на точке старта (до {r}).', startNoGps:'Не удалось определить местоположение. Включите геолокацию и проверьте ещё раз.', toStart:'Маршрут до точки старта', checkAgain:'Проверить ещё раз', startAnyway:'Всё равно начать (тест)',
  workedWhen:'Кто, когда и где работал', dToday:'Сегодня', dYesterday:'Вчера', d7:'7 дней', workedSum:'{w} работн. · {d}', filtered:'фильтр', showAllDays:'показать все дни',
  workDays:'Рабочие дни', daysSum:'{n} дн. · {km} · {h} ч', noDays:'Рабочих дней пока нет.', noDaysRange:'Нет рабочих дней по этому фильтру.',
  changeStart:'Изменить старт', pickStartNow:'Нажмите на карту — новый старт · Отмена',
  navIn:'Через {d}', navOnto:'на {name}', navAhead:'Дальше по {name}', navOff:'Вы вне маршрута ({d})', navExt:'Открыть в приложении карт', navThen:'Затем: {s}',
});
