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
Object.assign(T.de, {
  welcomeTitle:'Flyer verteilen', welcomeText:'Routen, Aufträge und Berichte für das Team.',
  phoneLogin:'Telefonnummer', sendCode:'Code per SMS senden', smsHint:'Du bekommst einmalig eine SMS mit einem Code, um deine Nummer zu bestätigen. Danach bleibst du angemeldet.',
  codeTitle:'Code eingeben', codeSent:'Wir haben einen Code an {phone} gesendet.', verify:'Bestätigen', resend:'Code erneut senden', resendIn:'Erneut senden in {s} s',
  wrongCode:'Code falsch oder abgelaufen.', smsFail:'SMS konnte nicht gesendet werden.', smsNotConfigured:'SMS-Versand ist noch nicht eingerichtet (Admin: SMS-Anbieter in Supabase verbinden).',
  badPhone:'Bitte gültige Telefonnummer eingeben, z. B. +49 170 1234567.', asWho:'Wie möchtest du arbeiten?', asAdmin:'Als Admin', asWorker:'Als Verteiler',
  switchToWorker:'Als Verteiler arbeiten', switchToAdmin:'Zum Admin wechseln', emailAdmin:'Admin mit E-Mail anmelden', yourData:'Deine Daten', changeNumber:'Andere Nummer',
  invitePhone:'Telefonnummer des neuen Admins', invitePhoneSent:'Eingeladen. Beim Login mit dieser Nummer erscheint „Als Admin".', continue:'Weiter',
});
Object.assign(T.ru, {
  welcomeTitle:'Раздача флаеров', welcomeText:'Маршруты, задания и отчёты для команды.',
  phoneLogin:'Номер телефона', sendCode:'Отправить код по SMS', smsHint:'Один раз придёт SMS с кодом, чтобы подтвердить номер. Дальше вы остаётесь в аккаунте.',
  codeTitle:'Введите код', codeSent:'Мы отправили код на {phone}.', verify:'Подтвердить', resend:'Отправить код ещё раз', resendIn:'Повторно через {s} с',
  wrongCode:'Код неверный или просрочен.', smsFail:'Не удалось отправить SMS.', smsNotConfigured:'Отправка SMS ещё не настроена (админ: подключите SMS-провайдера в Supabase).',
  badPhone:'Введите номер полностью, например +49 170 1234567.', asWho:'Как вы будете работать?', asAdmin:'Как админ', asWorker:'Как раздающий',
  switchToWorker:'Работать как раздающий', switchToAdmin:'Перейти в админ', emailAdmin:'Войти админом по e-mail', yourData:'Ваши данные', changeNumber:'Другой номер',
  invitePhone:'Телефон нового админа', invitePhoneSent:'Приглашён. При входе с этим номером появится «Как админ».', continue:'Дальше',
});
Object.assign(T.de, {
  stNew:'Neu – bitte antworten', stAccepted:'Angenommen', stDeclined:'Abgelehnt', accept:'Annehmen', decline:'Ablehnen', pickDays:'Arbeitstage wählen', dayN:'Tag {n}',
  declineQ:'Auftrag ablehnen?', declineText:'Der Admin wird den Auftrag neu vergeben.', yourDates:'Deine Arbeitstage', needAccept:'Bitte zuerst den Auftrag annehmen.',
  inbox:'Benachrichtigungen', noInbox:'Keine Benachrichtigungen.', pause:'Pause', resumeBtn:'Weiter', pauseRunning:'Pause läuft (unbezahlt)', netTime:'Arbeitszeit',
  flyersEst:'Flyer ≈', quotaLine:'Quote: {a} / {b} m in 30 Min.', summaryTitle:'Feierabend!', summaryBody:'Arbeitszeit {h} · Strecke {d} · ≈ {f} Flyer verteilt.',
  nextDay:'Nächster Arbeitstag: {date}', noNext:'Kein weiterer Tag geplant.', flyersOf:'{a} von {b}', mbApprox:'≈ {n} Briefkästen', quotaInfo:'Quote', dates:'Termine', ok:'OK',
  switchHint:'Du bist auch Admin.', taskTotal:'Flyer', dayHint:'Dauer ≈ {h} Std. = {n} Arbeitstag(e)',
});
Object.assign(T.ru, {
  stNew:'Новое — ответьте', stAccepted:'Принято', stDeclined:'Отказ', accept:'Принять', decline:'Отказаться', pickDays:'Выберите рабочие дни', dayN:'День {n}',
  declineQ:'Отказаться от задания?', declineText:'Админ назначит задание другому.', yourDates:'Ваши рабочие дни', needAccept:'Сначала примите задание.',
  inbox:'Уведомления', noInbox:'Уведомлений нет.', pause:'Пауза', resumeBtn:'Продолжить', pauseRunning:'Идёт пауза (не оплачивается)', netTime:'Время работы',
  flyersEst:'Флаеров ≈', quotaLine:'Квота: {a} / {b} м за 30 мин', summaryTitle:'Конец рабочего дня!', summaryBody:'Время {h} · путь {d} · ≈ {f} флаеров роздано.',
  nextDay:'Следующий рабочий день: {date}', noNext:'Следующий день не запланирован.', flyersOf:'{a} из {b}', mbApprox:'≈ {n} ящиков', quotaInfo:'Квота', dates:'Даты', ok:'OK',
  switchHint:'Вы также админ.', taskTotal:'Флаеры', dayHint:'Длительность ≈ {h} ч = {n} раб. дн.',
});
Object.assign(T.de, { e_date_required:'Bitte für jeden Tag ein eigenes Datum wählen.', e_plan_not_found:'Dieser Auftrag ist nicht mehr zugeteilt.', e_not_authenticated:'Bitte neu anmelden.' });
Object.assign(T.ru, { e_date_required:'Выберите для каждого дня свою дату.', e_plan_not_found:'Это задание вам больше не назначено.', e_not_authenticated:'Войдите заново.' });
Object.assign(T.de, { walkedLbl:'Gelaufen' });
Object.assign(T.ru, { walkedLbl:'Пройдено' });
Object.assign(T.de, { newNotif:'Neue Benachrichtigung: neuer Auftrag' });
Object.assign(T.ru, { newNotif:'Новое уведомление: новое задание' });
Object.assign(T.de, { offlineN:'{n} zuletzt gesehen' });
Object.assign(T.ru, { offlineN:'{n} не на маршруте' });
Object.assign(T.de, { settings:'Einstellungen' });
Object.assign(T.ru, { settings:'Настройки' });
Object.assign(T.de, { mapSearchPh:'Stadt suchen – Mitarbeiter in der Nähe', nearN:'{n} in der Nähe von {c}', nearNone:'Niemand im Umkreis von {k} km um {c}', livesIn:'wohnt in {c}' });
Object.assign(T.ru, { mapSearchPh:'Найти город — работники рядом', nearN:'{n} рядом с {c}', nearNone:'Никого в радиусе {k} км от {c}', livesIn:'живёт: {c}' });
