// Texts added for the mailbox-based planning, phone login and task flow
import { T } from './i18n.js';
Object.assign(T.de, {
  flyers:'Flyer', mailboxes:'Briefkästen', loadingArea:'Lade Straßen und Gebäude…', loadingMore:'Gebiet wird erweitert…', calculating:'Berechne Routen…',
  planSum:'≈ {mb} Briefkästen · {km} Weg · ≈ {h} Std. gesamt', areaSmall:'Im Umkreis gibt es nur ≈ {mb} Briefkästen.',
  tooBig:'Zu groß: längste Route ≈ {h} Std., verfügbar {lim} Std. ({d} Tage).', reduceTo:'Auf {f} Flyer reduzieren', moreWorkers:'Oder mehr Mitarbeiter einteilen.',
  fitsOk:'Passt in {d} Tage.', startDate:'Beginn', hoursDay:'Arbeitstag netto (Std.)', quota:'Quote: Meter pro 30 Min.', flyersCount:'Anzahl Flyer',
  routeLine:'{km} · ≈ {h} Std. · {mb} Briefkästen', daysN:'{n} Tag(e)', startLoc:'Startpunkt', dist2:'Strecke', mbShort:'Kästen',
  assigned:'Auftrag zugeteilt', stOffered:'wartet auf Antwort', stAccepted:'angenommen', stDeclined:'abgelehnt', stDone:'erledigt', workDays:'Arbeitstage',
  replaceHint:'Neuen Mitarbeiter wählen: er bekommt den Rest der Route.', flyersDone:'≈ {a} von {b} Flyer', quotaLow:'unter der Quote', quotaHigh:'sehr schnell', onPause:'Pause',
  fFrom:'Von', fTo:'Bis', fCity:'Stadt', fDistrict:'Bezirk', fAll:'Alle', fOpen:'Offen', fDone:'Abgeschlossen', filter:'Filter', noMatch:'Keine Aufträge für diesen Filter.',
  newTaskTitle:'Neuer Auftrag: {title}', newTaskBody:'{date}{mb} Briefkästen · {km}. Bitte Route ansehen und annehmen.',
});
Object.assign(T.ru, {
  flyers:'Флаеры', mailboxes:'Ящики', loadingArea:'Загружаю улицы и здания…', loadingMore:'Расширяю район…', calculating:'Считаю маршруты…',
  planSum:'≈ {mb} ящиков · {km} пути · ≈ {h} ч всего', areaSmall:'В радиусе только ≈ {mb} ящиков.',
  tooBig:'Слишком много: самый длинный маршрут ≈ {h} ч, доступно {lim} ч ({d} дн.).', reduceTo:'Уменьшить до {f} флаеров', moreWorkers:'Или назначьте больше работников.',
  fitsOk:'Укладывается в {d} дн.', startDate:'Начало', hoursDay:'Рабочий день чистыми (ч)', quota:'Квота: метров за 30 мин', flyersCount:'Количество флаеров',
  routeLine:'{km} · ≈ {h} ч · {mb} ящиков', daysN:'{n} дн.', startLoc:'Точка старта', dist2:'Путь', mbShort:'ящ.',
  assigned:'Задание назначено', stOffered:'ждёт ответа', stAccepted:'принято', stDeclined:'отказ', stDone:'выполнено', workDays:'Рабочие дни',
  replaceHint:'Выберите нового работника — он получит остаток маршрута.', flyersDone:'≈ {a} из {b} флаеров', quotaLow:'ниже квоты', quotaHigh:'слишком быстро', onPause:'пауза',
  fFrom:'С', fTo:'По', fCity:'Город', fDistrict:'Район', fAll:'Все', fOpen:'Открытые', fDone:'Завершённые', filter:'Фильтр', noMatch:'Нет заданий по этому фильтру.',
  newTaskTitle:'Новое задание: {title}', newTaskBody:'{date}{mb} ящиков · {km}. Посмотрите маршрут и примите задание.',
});
