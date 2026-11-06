// Companies: registration, company code, company settings, AVV
import { T } from './i18n.js';
Object.assign(T.de, {
  copy:'Kopieren', copied:'Kopiert', mustTitle:'Pflichtgebiete', mustHint:'Hier wird auf jeden Fall verteilt – zusätzlich zur normalen Route ab dem Startpunkt. Die Briefkästen zählen zur Flyerzahl.', mustAdd:'Gebiet einzeichnen', mustN:'Gebiet {n}', mustMb:'≈ {mb} Briefkästen', mustSum:'{n} · ≈ {mb} Briefkästen', mustDrawHint:'Tippe die Ecken des Gebiets auf die Karte', mustCorners:'{n} Ecken (mind. 3)', mustUndo:'Rückgängig', mustTooMany:'Die Pflichtgebiete haben ≈ {mb} Briefkästen, aber nur {f} Flyer. Mehr Flyer eingeben oder ein Gebiet verkleinern.', mustDone:'Fertig', handoverHint:'Willkommen! Bitte trage deinen Namen, deine Handynummer und die Städte ein, in denen du arbeiten kannst, und tippe auf „Speichern“.', handoverPhone:'Deine Handynummer', e_phone_taken:'Diese Nummer ist schon bei FlyerMap registriert.', e_phone_invalid:'Bitte eine deutsche Handynummer eingeben.', loginLink:'Login-Link zum Weitergeben', loginLinkHint:'Wer diesen Link öffnet, ist in diesem Konto angemeldet. Nur an die Person schicken, für die das Konto ist.',
  newUserQ:'Wie möchtest du FlyerMap nutzen?', newUserWorker:'Ich verteile Flyer', newUserWorkerSub:'Du hast einen Firmencode oder Link von deiner Firma.',
  newUserFirm:'Ich registriere meine Firma', newUserFirmSub:'Du planst Aufträge und teilst Verteiler ein.',
  firmRegTitle:'Firma registrieren', firmRegHint:'Diese Angaben sehen deine Verteiler in der Datenschutzerklärung: deine Firma ist für ihre Daten verantwortlich.', firmRegBtn:'Firma registrieren',
  fmName:'Firmenname mit Rechtsform', fmNamePh:'z. B. Muster Prospektverteilung GmbH', fmStreet:'Straße und Hausnummer', fmZip:'PLZ', fmCity:'Ort',
  fmRep:'Vertreten durch', fmRepPh:'Geschäftsführer/in oder Inhaber/in', fmEmail:'E-Mail für Datenschutzfragen', fmPhone:'Telefon (optional)',
  fmDpo:'Datenschutzbeauftragte/r (optional)', fmDpoPh:'Name und Kontakt', fmWorksCouncil:'Wir haben einen Betriebsrat',
  fmAvvAccept:'Ich nehme für die Firma den Vertrag zur Auftragsverarbeitung (AVV) an.', fmAvvRead:'AVV lesen', avvTitle:'Vertrag zur Auftragsverarbeitung (AVV)',
  firm:'Firma', firmMissing:'Bitte Firmendaten eintragen – sie erscheinen in der Datenschutzerklärung deiner Verteiler.', firmAvvMissing:'Bitte den Vertrag zur Auftragsverarbeitung (AVV) annehmen.',
  firmCode:'Firmencode für Verteiler', firmCodeHint:'Neue Verteiler geben diesen Code bei der Registrierung ein oder öffnen den Link.',
  firmInviteText:'Registriere dich bei FlyerMap für {firm}: {link} – Firmencode: {code}',
  avvAccepted:'AVV angenommen am {d} ({v})', avvNotAccepted:'AVV noch nicht angenommen', firmEdit:'Firmendaten bearbeiten', firmNewCode:'Neuer Code',
  firmNewCodeQ:'Der alte Code und Link funktionieren danach nicht mehr. Bereits registrierte Verteiler bleiben.',
  joinCode:'Firmencode', joinCodeHint:'8 Zeichen – bekommst du von deiner Firma (oder öffne ihren Link).', joinCodeOk:'Firma: {name}', joinCodeBad:'Code unbekannt',
  myFirm:'Firma',
  e_company_name_required:'Bitte den Firmennamen eingeben.', e_company_street_required:'Bitte Straße und Hausnummer eingeben.', e_company_zip_required:'Bitte eine 5-stellige PLZ eingeben.',
  e_company_city_required:'Bitte den Ort eingeben.', e_company_rep_required:'Bitte angeben, wer die Firma vertritt.', e_company_email_required:'Bitte eine gültige E-Mail-Adresse eingeben.',
  e_avv_required:'Bitte den AVV annehmen.', e_avv_outdated:'Der AVV wurde geändert – bitte App neu laden.', e_code_invalid:'Firmencode unbekannt. Bitte bei deiner Firma nachfragen.',
  e_phone_other_company:'Diese Nummer ist schon bei einer anderen Firma registriert.', e_already_admin:'Du bist schon Admin einer Firma.',
  offersQ:'Jobangebote von anderen Firmen?', offersYes:'Ja, ich möchte Jobangebote bekommen', offersNo:'Nein, danke', offersQSub:'Andere Firmen in FlyerMap sehen dann deinen Namen, deine Städte und deine Telefonnummer und können dir Arbeit anbieten – keine Standorte und keine Arbeitstage. Jederzeit im Profil abwählbar.',
  offersOptIn:'Ich möchte auch Jobangebote von anderen Firmen bekommen (freiwillig).', offersOptInSub:'Dann sehen andere Firmen in FlyerMap deinen Namen, deine Städte und deine Telefonnummer – keine Standorte und keine Arbeitstage. Jederzeit im Profil abwählbar.',
  poolTitle:'Verteiler anderer Firmen (offen für Angebote)', poolHint:'Diese Verteiler haben eingewilligt, Jobangebote von anderen Firmen zu bekommen.', poolNone:'Zurzeit niemand.', poolMsg:'Hallo, wir haben dich über FlyerMap gefunden und hätten Arbeit für dich.',
  master:'Plattform – alle Firmen', msCompanies:'Firmen', msWorkers:'Verteiler', msOpen:'Offen für Angebote', msNoName:'(ohne Namen)', msNoAvv:'AVV fehlt', msNoData:'Keine Firmendaten', msNone:'Keine Firmen',
  msCounts:'{a} Admin · {w} Verteiler · {o} Aufträge', msLast:'zuletzt aktiv {a}', msSearch:'Name, Telefon oder Firma', msOffersOk:'offen für Angebote',
  msMasters:'Master-Admins', msYou:'du', msRemove:'Entfernen', msRemoveQ:'Diese Person verliert den Zugriff auf alle Firmen.', msInvited:'eingeladen', msAdd:'Master-Admin hinzufügen',
  msAddHint:'Telefonnummer oder E-Mail eines bestehenden FlyerMap-Kontos.', msNoAccount:'Zu dieser Nummer bzw. E-Mail gibt es noch kein Konto. Die Person muss sich zuerst einmal anmelden.', msBadIdent:'Bitte Telefonnummer oder E-Mail eingeben.', msAdded:'Hinzugefügt', msInvitedToast:'Eingeladen – gilt beim ersten Login',
});
Object.assign(T.ru, {
  copy:'Копировать', copied:'Скопировано', mustTitle:'Обязательные участки', mustHint:'Здесь раздать обязательно — в дополнение к обычному маршруту от точки старта. Ящики засчитываются в число флаеров.', mustAdd:'Обвести участок', mustN:'Участок {n}', mustMb:'≈ {mb} ящиков', mustSum:'{n} · ≈ {mb} ящиков', mustDrawHint:'Нажимайте на карту по углам участка', mustCorners:'{n} углов (мин. 3)', mustUndo:'Отменить', mustTooMany:'В обязательных участках ≈ {mb} ящиков, а флаеров только {f}. Увеличьте число флаеров или уменьшите участок.', mustDone:'Готово', handoverHint:'Добро пожаловать! Впишите своё имя, номер мобильного и города, где можете работать, и нажмите «Сохранить».', handoverPhone:'Ваш мобильный номер', e_phone_taken:'Этот номер уже зарегистрирован в FlyerMap.', e_phone_invalid:'Введите немецкий мобильный номер.', loginLink:'Ссылка для входа (передать)', loginLinkHint:'Кто откроет эту ссылку, войдёт в этот аккаунт. Отправляйте только тому, для кого аккаунт.',
  newUserQ:'Как вы будете пользоваться FlyerMap?', newUserWorker:'Я раздаю флаеры', newUserWorkerSub:'У вас есть код или ссылка от вашей фирмы.',
  newUserFirm:'Я регистрирую свою фирму', newUserFirmSub:'Вы планируете заказы и распределяете раздающих.',
  firmRegTitle:'Регистрация фирмы', firmRegHint:'Эти данные раздающие увидят в политике конфиденциальности: ваша фирма отвечает за их данные.', firmRegBtn:'Зарегистрировать фирму',
  fmName:'Название фирмы с формой', fmNamePh:'например, Muster Prospektverteilung GmbH', fmStreet:'Улица и дом', fmZip:'Индекс', fmCity:'Город',
  fmRep:'Представитель', fmRepPh:'Директор или владелец', fmEmail:'E-mail для вопросов о данных', fmPhone:'Телефон (необязательно)',
  fmDpo:'Уполномоченный по защите данных (необязательно)', fmDpoPh:'Имя и контакт', fmWorksCouncil:'У нас есть совет работников (Betriebsrat)',
  fmAvvAccept:'Я принимаю для фирмы договор об обработке данных (AVV).', fmAvvRead:'Читать AVV', avvTitle:'Договор об обработке данных (AVV)',
  firm:'Фирма', firmMissing:'Заполните данные фирмы — они показываются раздающим в политике конфиденциальности.', firmAvvMissing:'Примите договор об обработке данных (AVV).',
  firmCode:'Код фирмы для раздающих', firmCodeHint:'Новые раздающие вводят этот код при регистрации или открывают ссылку.',
  firmInviteText:'Регистрируйся в FlyerMap для {firm}: {link} – код фирмы: {code}',
  avvAccepted:'AVV принят {d} ({v})', avvNotAccepted:'AVV ещё не принят', firmEdit:'Изменить данные фирмы', firmNewCode:'Новый код',
  firmNewCodeQ:'Старый код и ссылка перестанут работать. Уже зарегистрированные раздающие останутся.',
  joinCode:'Код фирмы', joinCodeHint:'8 символов — его даёт ваша фирма (или откройте её ссылку).', joinCodeOk:'Фирма: {name}', joinCodeBad:'Код не найден',
  myFirm:'Фирма',
  e_company_name_required:'Введите название фирмы.', e_company_street_required:'Введите улицу и дом.', e_company_zip_required:'Введите индекс из 5 цифр.',
  e_company_city_required:'Введите город.', e_company_rep_required:'Укажите представителя фирмы.', e_company_email_required:'Введите правильный e-mail.',
  e_avv_required:'Примите AVV.', e_avv_outdated:'AVV изменился — перезагрузите приложение.', e_code_invalid:'Код фирмы не найден. Спросите у своей фирмы.',
  e_phone_other_company:'Этот номер уже зарегистрирован в другой фирме.', e_already_admin:'Вы уже админ фирмы.',
  offersQ:'Предложения работы от других фирм?', offersYes:'Да, хочу получать предложения', offersNo:'Нет, спасибо', offersQSub:'Другие фирмы в FlyerMap увидят ваше имя, города и телефон и смогут предложить работу — без геопозиции и рабочих дней. Можно отключить в профиле в любой момент.',
  offersOptIn:'Я хочу получать предложения работы и от других фирм (добровольно).', offersOptInSub:'Тогда другие фирмы в FlyerMap увидят ваше имя, города и телефон — без геопозиции и рабочих дней. Можно отключить в профиле в любой момент.',
  poolTitle:'Раздающие других фирм (открыты для предложений)', poolHint:'Эти раздающие согласились получать предложения работы от других фирм.', poolNone:'Пока никого.', poolMsg:'Здравствуйте, мы нашли вас через FlyerMap, у нас есть работа для вас.',
  master:'Платформа — все фирмы', msCompanies:'Фирмы', msWorkers:'Раздающие', msOpen:'Открыты для предложений', msNoName:'(без названия)', msNoAvv:'Нет AVV', msNoData:'Нет данных фирмы', msNone:'Фирм нет',
  msCounts:'{a} админ · {w} раздающих · {o} заказов', msLast:'последняя активность {a}', msSearch:'Имя, телефон или фирма', msOffersOk:'открыт для предложений',
  msMasters:'Мастер-админы', msYou:'вы', msRemove:'Удалить', msRemoveQ:'Этот человек потеряет доступ ко всем фирмам.', msInvited:'приглашён', msAdd:'Добавить мастер-админа',
  msAddHint:'Телефон или e-mail уже существующего аккаунта FlyerMap.', msNoAccount:'С этим номером или e-mail аккаунта ещё нет. Человек должен сначала один раз войти.', msBadIdent:'Введите телефон или e-mail.', msAdded:'Добавлено', msInvitedToast:'Приглашение сохранено — сработает при первом входе',
});
// own distribution area + priority areas with a flyer count (30.10.2026)
Object.assign(T.de, {
  mustTitle:'Pflichtgebiete', mustHint:'Hier soll auf jeden Fall ein Teil der Flyer verteilt werden – du legst fest, wie viele. Sie zählen zur Gesamtzahl, der Rest geht wie gewohnt rund um den Startpunkt.',
  mustNTitle:'Wie viele Flyer in diesem Gebiet?', mustNHint:'Verteilt wird in dem Teil des Gebiets, der dem Startpunkt am nächsten liegt.',
  mustAll:'Alle Briefkästen im Gebiet', mustAllShort:'alle Briefkästen', mustNFly:'{n} Flyer', mustAvail:'≈ {mb} Briefkästen im Gebiet', mustFewer:'weniger als gewünscht',
  change:'Ändern',
  zoneBig:'Im eingezeichneten Gebiet sind ≈ {mb} Briefkästen, geplant sind nur {f} Flyer.', zoneAll:'Alle {f} verteilen', panelHide:'Einklappen', panelShow:'Ausklappen',
  zoneTitle:'Verteilgebiet', zoneAuto:'automatisch', zoneOwn:'selbst eingezeichnet',
  zoneHint:'Automatisch: ein kompaktes Gebiet rund um den Startpunkt. Gefällt es dir nicht, zeichne das Gebiet selbst ein – dann wird nur darin verteilt.',
  zoneHintOwn:'Es wird nur innerhalb des eingezeichneten Gebiets verteilt (und in den Pflichtgebieten).',
  zoneDraw:'Gebiet selbst einzeichnen', zoneRedraw:'Neu einzeichnen', zoneBackAuto:'Wieder automatisch',
  zoneDrawHint:'Tippe die Ecken deines Verteilgebiets auf die Karte',
  zoneSmall:'Im eingezeichneten Gebiet sind nur ≈ {mb} Briefkästen, aber {f} Flyer. Größer zeichnen oder weniger Flyer:',
});
Object.assign(T.ru, {
  mustTitle:'Обязательные участки', mustHint:'Здесь нужно раздать часть флаеров — вы сами задаёте сколько. Они входят в общее число, остальное — как обычно вокруг точки старта.',
  mustNTitle:'Сколько флаеров в этом участке?', mustNHint:'Раздаётся в той части участка, что ближе всего к точке старта.',
  mustAll:'Все ящики в участке', mustAllShort:'все ящики', mustNFly:'{n} флаеров', mustAvail:'≈ {mb} ящиков в участке', mustFewer:'меньше, чем нужно',
  change:'Изменить',
  zoneBig:'В нарисованном районе ≈ {mb} ящиков, а запланировано только {f} флаеров.', zoneAll:'Раздать все {f}', panelHide:'Свернуть', panelShow:'Развернуть',
  zoneTitle:'Район раздачи', zoneAuto:'автоматически', zoneOwn:'нарисован вручную',
  zoneHint:'Автоматически: компактный район вокруг точки старта. Если не нравится — нарисуйте район сами, тогда раздача будет только в нём.',
  zoneHintOwn:'Раздача только внутри нарисованного района (и в обязательных участках).',
  zoneDraw:'Нарисовать район самому', zoneRedraw:'Нарисовать заново', zoneBackAuto:'Снова автоматически',
  zoneDrawHint:'Нажимайте на карту по углам своего района',
  zoneSmall:'В нарисованном районе только ≈ {mb} ящиков, а флаеров {f}. Нарисуйте больше или уменьшите флаеры:',
});
// open routes: distributors take free routes of their company themselves (31.10.2026)
Object.assign(T.de, {
  openRoutes:'Freie Routen', openHint:'Hier ist noch niemand eingeteilt – du kannst eine Route selbst übernehmen.', stOpen:'Frei',
  openDetailHint:'Diese Route hat noch niemand. Wähle deine Tage und übernimm sie – der Disponent sieht es sofort.',
  openRoute:'Freie Route', claim:'Route übernehmen', claimed:'Route übernommen',
  e_plan_taken:'Diese Route hat gerade jemand anderes übernommen.', e_already_in_task:'Du hast in diesem Auftrag schon eine Route.',
});
Object.assign(T.ru, {
  openRoutes:'Свободные маршруты', openHint:'Сюда ещё никто не назначен — можно взять маршрут самому.', stOpen:'Свободен',
  openDetailHint:'Этот маршрут ещё никто не взял. Выберите свои дни и возьмите его — диспетчер сразу это увидит.',
  openRoute:'Свободный маршрут', claim:'Взять маршрут', claimed:'Маршрут ваш',
  e_plan_taken:'Этот маршрут только что взял кто-то другой.', e_already_in_task:'В этом заказе у вас уже есть маршрут.',
});
Object.assign(T.de, { assignHint:'Wähle für jede Route einen Mitarbeiter. Routen ohne Mitarbeiter sehen alle Verteiler deiner Firma als „Freie Route“ und können sie selbst übernehmen.' });
Object.assign(T.ru, { assignHint:'Выберите работника для каждого маршрута. Маршруты без работника все раздающие вашей фирмы видят как «Свободный маршрут» и могут взять их сами.' });
// big map for distributors (01.11.2026)
Object.assign(T.de, { area:'Gebiet', routeLen:'Strecke', mapBig:'Große Karte', mapSmall:'Details' });
Object.assign(T.ru, { area:'Район', routeLen:'Длина', mapBig:'Большая карта', mapSmall:'Подробно' });
// guidance to the route when the walker is away from it (01.11.2026)
Object.assign(T.de, { navToStart:'Zum Routenbeginn · {d}', navBack:'Zurück zur Route · {d}', navToSub:'Der lila Linie folgen · Kartentaste rechts = Fußweg' });
Object.assign(T.ru, { navToStart:'К началу маршрута · {d}', navBack:'Назад к маршруту · {d}', navToSub:'Идите по фиолетовой линии · кнопка карты справа = пешеходный путь' });
Object.assign(T.de, { rvLive:'Wo gerade' });
Object.assign(T.ru, { rvLive:'Где сейчас' });
Object.assign(T.de, { contDayN:'Tag {n} fortsetzen', navLeft:'Noch {n} % offen · nächste Straße {d}' });
Object.assign(T.ru, { contDayN:'Продолжить день {n}', navLeft:'Ещё не пройдено {n} % · ближайшая улица {d}' });
Object.assign(T.de, { rerouted:'Route an deinen Weg angepasst' });
Object.assign(T.ru, { rerouted:'Маршрут подстроен под ваш путь' });
Object.assign(T.de, { checkpoints:'Checkpoints', cpTitle:'Tag {d} · Abschnitt {n} · {p} % erledigt' });
Object.assign(T.ru, { checkpoints:'Чекпоинты', cpTitle:'День {d} · участок {n} · пройдено {p} %' });
Object.assign(T.de, { walkedLine:'Gelaufen: {km} · {h} Std. Arbeitszeit', walkedLive:'läuft gerade' });
Object.assign(T.ru, { walkedLine:'Пройдено: {km} · {h} ч работы', walkedLive:'сейчас в пути' });
Object.assign(T.de, { rvDoneBefore:'Schon erledigt' });
Object.assign(T.ru, { rvDoneBefore:'Уже пройдено' });
Object.assign(T.de, { skipBtn:'Nicht nötig', skipQ:'Diesen Abschnitt überspringen?', skipText:'Der rot markierte Abschnitt (≈ {d}) wird als „nicht nötig“ markiert, z. B. Straße ohne Häuser oder Häuser schon von einer anderen Straße aus beliefert. Der Admin sieht das.', skipYes:'Überspringen', skipDone:'Übersprungen – Route angepasst', skipNone:'Vor dir ist kein offener Abschnitt', rvSkipped:'Übersprungen' });
Object.assign(T.ru, { skipBtn:'Не нужно', skipQ:'Пропустить этот участок?', skipText:'Участок, отмеченный красным (≈ {d}), будет помечен как «не нужно»: например, дорога без домов или дома уже обойдены с другой улицы. Админ это увидит.', skipYes:'Пропустить', skipDone:'Пропущено — маршрут обновлён', skipNone:'Впереди нет непройденного участка', rvSkipped:'Пропущено' });
Object.assign(T.de, { navTarget:'Nächstes Ziel' });
Object.assign(T.ru, { navTarget:'Следующая цель' });
Object.assign(T.de, { dayEndBtn:'Tag {n} beenden · Tag {m} starten', dayEndQ:'Tag {n} beenden?', dayEndText:'Von Tag {n} sind noch ≈ {p} % offen. Diese Reste werden als „nicht nötig“ markiert (der Admin sieht das) und es geht sofort mit Tag {m} weiter.', dayEndYes:'Tag {m} starten', dayEndDone:'Weiter mit Tag {m}' });
Object.assign(T.ru, { dayEndBtn:'Закончить день {n} · начать день {m}', dayEndQ:'Закончить день {n}?', dayEndText:'В дне {n} осталось ≈ {p} % непройденного. Эти остатки будут помечены как «не нужно» (админ это увидит), и сразу начнётся день {m}.', dayEndYes:'Начать день {m}', dayEndDone:'Продолжаем: день {m}' });
Object.assign(T.de, { rvOutside:'davon außerhalb der Routen' });
Object.assign(T.ru, { rvOutside:'из них вне маршрутов' });
Object.assign(T.de, { haveLink:'Ich habe einen Login-Link', haveLinkHint:'Den Link, den du vom Admin bekommen hast (z. B. per WhatsApp), hier einfügen.', haveLinkGo:'Anmelden', haveLinkBad:'Das ist kein gültiger Login-Link.' });
Object.assign(T.ru, { haveLink:'У меня есть ссылка для входа', haveLinkHint:'Вставьте сюда ссылку, которую прислал админ (например, в WhatsApp).', haveLinkGo:'Войти', haveLinkBad:'Это не ссылка для входа.' });
Object.assign(T.de, { handedLbl:'Verteilt' });
Object.assign(T.ru, { handedLbl:'Роздано' });
Object.assign(T.de, { startTooFar2:'Du bist {d} vom Startpunkt entfernt und auch nicht an einer offenen Stelle deiner Route. Starten kannst du am Startpunkt oder direkt an einer noch offenen Straße deiner Route (bis {r}).' });
Object.assign(T.ru, { startTooFar2:'Вы в {d} от точки старта и не рядом с непройденной частью своего маршрута. Начать можно на точке старта или прямо у ещё не пройденной улицы своего маршрута (до {r}).' });
Object.assign(T.de, { hoursLbl:'Arbeitszeit (gemacht / Plan)' });
Object.assign(T.ru, { hoursLbl:'Часы (сделано / по плану)' });
Object.assign(T.de, { whyLbl:'Warum?', whyPh:'Grund kurz beschreiben', whyNeed:'Bitte einen Grund wählen oder schreiben.', why1:'Keine Häuser / nur Straße', why2:'Kein Zugang (privat, Tor, Baustelle)', why3:'Schon verteilt (von anderer Straße)', why4:'Gefährlich (keine Gehwege, Schnellstraße)', why5:'Keine Zeit / keine Flyer mehr' });
Object.assign(T.ru, { whyLbl:'Почему?', whyPh:'Коротко опишите причину', whyNeed:'Выберите или напишите причину.', why1:'Нет домов / только дорога', why2:'Нет доступа (частное, ворота, стройка)', why3:'Уже разнесено (с другой улицы)', why4:'Опасно (нет тротуара, трасса)', why5:'Нет времени / закончились флаеры' });
Object.assign(T.de, { chgDates:'Tage ändern', datesChangedTitle:'Neue Arbeitstage: {title}' });
Object.assign(T.ru, { chgDates:'Изменить дни', datesChangedTitle:'Новые рабочие дни: {title}' });
Object.assign(T.de, { allLinks:'Login-Links aller Mitarbeiter' });
Object.assign(T.ru, { allLinks:'Ссылки для входа всех работников' });
Object.assign(T.de, { pauseLbl:'Pause' });
Object.assign(T.ru, { pauseLbl:'Пауза' });
Object.assign(T.de, { openWorker:'Mitarbeiter-Seite öffnen', swapWorker:'Wechseln' });
Object.assign(T.ru, { openWorker:'Открыть страницу работника', swapWorker:'Заменить' });
Object.assign(T.de, { mainCity:'Hauptstadt', sideTowns:'Weitere Orte (optional)', sideTownsHint:'Wo der Kunde zusätzlich verteilen möchte – Name eingeben, der Ort wird mit seinen Grenzen als Pflichtgebiet übernommen.', townSearch:'Ort / Ortsteil eingeben', placeLoading:'Grenzen werden geladen …', placeTooFar:'Dieser Ort ist mehr als {km} km vom Startpunkt entfernt – dafür besser einen eigenen Auftrag anlegen.', placeCircle:'Keine Grenzen gefunden – Kreis um den Ortskern übernommen. Bei Bedarf selbst zeichnen.' });
Object.assign(T.ru, { mainCity:'Основной город', sideTowns:'Дополнительные места (по желанию)', sideTownsHint:'Где заказчик хочет раздать дополнительно – введите название, место с его границами станет обязательным участком.', townSearch:'Город / район / деревня', placeLoading:'Загружаем границы …', placeTooFar:'Это место дальше {km} км от старта – лучше сделать для него отдельный заказ.', placeCircle:'Границы не найдены – взят круг вокруг центра. При необходимости нарисуйте сами.' });
Object.assign(T.de, { pwChange:'Passwort ändern', pwNew:'Neues Passwort', pwAgain:'Neues Passwort wiederholen', pwShort:'Mindestens 8 Zeichen.', pwDiff:'Die Passwörter sind nicht gleich.' });
Object.assign(T.ru, { pwChange:'Изменить пароль', pwNew:'Новый пароль', pwAgain:'Повторите новый пароль', pwShort:'Минимум 8 символов.', pwDiff:'Пароли не совпадают.' });
Object.assign(T.de, { sideTitle:'Weitere Orte (mit Anfahrt)', sideAdded:'{name} ist weiter weg – eigener Startpunkt, Anfahrt mit Bus/Bahn', sideOwn:'eigene Anfahrt · {km} km · {n} Flyer', sideOwnHint:'Weiter entfernte Orte bleiben im selben Auftrag mit eigenem Startpunkt. Die Tage werden nach Zeit aufgeteilt (z. B. Rest der Hauptstadt und dann der Ort am selben Tag). Für die Anfahrt bekommt der Mitarbeiter Bus-/Bahn-Vorschläge.', loadingSide:'Weitere Orte werden geladen …' });
Object.assign(T.ru, { sideTitle:'Доп. места (с переездом)', sideAdded:'{name} далеко – свой старт, переезд на автобусе/поезде', sideOwn:'с переездом · {km} км · {n} флаеров', sideOwnHint:'Дальние места остаются в том же заказе со своим стартом. Дни делятся по времени (например, остаток основного города и потом это место в тот же день). Для переезда работнику предлагаются автобус/поезд.', loadingSide:'Загружаем доп. места …' });
Object.assign(T.de, { busTrain:'Bus & Bahn (Google Maps)', appleMaps:'Apple Karten', onFoot:'Lieber zu Fuß', farAway:'Noch {d} bis zur Route – mit Bus oder Bahn hinfahren?' });
Object.assign(T.ru, { busTrain:'Автобус и поезд (Google Maps)', appleMaps:'Apple Карты', onFoot:'Лучше пешком', farAway:'До маршрута ещё {d} – доехать на автобусе или поезде?' });
Object.assign(T.de, { newLinkAcc:'Mitarbeiter mit Login-Link anlegen', newLinkHint:'Solange die SMS-Anmeldung noch nicht aktiv ist: Konto anlegen und den Link an den Mitarbeiter schicken. Name, Handynummer und Städte trägt er selbst im Profil ein.', nameOpt:'Name (optional)', cityOpt:'Stadt (optional)', createLink:'Konto anlegen', newWorkerName:'Neuer Mitarbeiter' });
Object.assign(T.ru, { newLinkAcc:'Создать работника со ссылкой', newLinkHint:'Пока вход по SMS не работает: создайте аккаунт и отправьте ссылку работнику. Имя, номер и города он впишет сам в профиле.', nameOpt:'Имя (по желанию)', cityOpt:'Город (по желанию)', createLink:'Создать аккаунт', newWorkerName:'Новый работник' });
Object.assign(T.de, { sideTowns:'Nebenstädte (optional)', sideTownsHint:'Wo der Kunde zusätzlich verteilen möchte: Namen eingeben (die Grenzen werden übernommen) oder selbst auf der Karte zeichnen. Weiter entfernte Orte bekommen einen eigenen Startpunkt und einen Mitarbeiter. Die Route wird erst im nächsten Schritt berechnet.', drawOwn:'Selbst auf der Karte zeichnen', areaN:'Gebiet {n}', sideNeedStart:'Zuerst oben die Startadresse suchen (Hauptstadt).' });
Object.assign(T.ru, { sideTowns:'Доп. города (по желанию)', sideTownsHint:'Где заказчик хочет раздать дополнительно: введите название (границы подтянутся) или нарисуйте сами на карте. Дальние места получают свой старт и одного работника. Маршрут считается только на следующем шаге.', drawOwn:'Нарисовать на карте', areaN:'Участок {n}', sideNeedStart:'Сначала найдите сверху адрес старта (основной город).' });
Object.assign(T.de, { busHint:'Mit Bus/Bahn statt zu Fuß (auf dem Weg dorthin keine Briefkästen): {list}' });
Object.assign(T.ru, { busHint:'На автобусе/поезде, а не пешком (по дороге нет почтовых ящиков): {list}' });
Object.assign(T.de, { joinTitle:'Konto erstellen', joinFirm:'Du wurdest von {name} eingeladen. Gib deinen Namen und deine Handynummer ein – deine Städte trägst du danach im Profil ein.', joinGo:'Konto erstellen', inviteTitle:'Einladungslink für neue Mitarbeiter', inviteHint:'Diesen Link an neue Mitarbeiter schicken (z. B. per WhatsApp). Wer ihn öffnet, erstellt sich selbst ein Konto in deiner Firma – ohne SMS. Neuer Link: unter Einstellungen → Firma den Code erneuern.', inviteMsg:'Hallo! Hier kannst du dir dein Konto für die Flyer-Verteilung erstellen: {link}' });
Object.assign(T.ru, { joinTitle:'Создать аккаунт', joinFirm:'Вас пригласила фирма {name}. Введите имя и номер мобильного – города потом впишете в профиле.', joinGo:'Создать аккаунт', inviteTitle:'Ссылка-приглашение для новых работников', inviteHint:'Отправьте эту ссылку новым работникам (например, в WhatsApp). Кто её откроет, сам создаст себе аккаунт в вашей фирме – без SMS. Новая ссылка: Настройки → Фирма → обновить код.', inviteMsg:'Привет! Здесь можно создать аккаунт для раздачи флаеров: {link}' });
Object.assign(T.de, { noPhoneYet:'Handynummer noch nicht eingetragen' });
Object.assign(T.ru, { noPhoneYet:'Номер телефона ещё не указан' });
Object.assign(T.de, { addrMain:'Startadresse in der Hauptstadt', mainCityAuto:'wird aus der Adresse übernommen', startOnMap:'Startpunkt auf der Karte gesetzt.' });
Object.assign(T.ru, { addrMain:'Адрес старта в основном городе', mainCityAuto:'берётся из адреса', startOnMap:'Точка старта выбрана на карте.' });
Object.assign(T.de, { quotaHours:'Danach werden die Stunden berechnet: Strecke ÷ Quote × 30 Min. plus 5 Sek. pro Briefkasten.' });
Object.assign(T.ru, { quotaHours:'По ней считаются часы: длина маршрута ÷ квота × 30 мин. плюс 5 сек. на каждый ящик.' });
Object.assign(T.de, { sideTownsShort:'Nebenstädte' });
Object.assign(T.ru, { sideTownsShort:'Доп. города' });
Object.assign(T.de, { areaWhole:'ganze Gemeinde, ≈ {km2} km²', areaPart:'nur Ortsteil, ≈ {km2} km²' });
Object.assign(T.ru, { areaWhole:'вся община, ≈ {km2} км²', areaPart:'только район, ≈ {km2} км²' });
Object.assign(T.de, { bikeOk:'Zwischen den Orten fahren (Rad, Auto oder Bus)', bikeHint:'Z. B. Dörfer, die 1–3 km auseinander liegen: die Wege zwischen den Orten werden gefahren (≈ 15 km/h + 5 Min.) statt mit 30 Min. Bus gerechnet; womit, ist egal. Verteilt wird zu Fuß.', bikeLbl:'Fahren zwischen Orten', yes:'ja', byBike:'Mit dem Fahrrad (Google Maps)', farBike:'Noch {d} bis zur Route – mit dem Fahrrad hinfahren?' });
Object.assign(T.ru, { bikeOk:'Переезды между местами (велосипед, машина или автобус)', bikeHint:'Например, деревни в 1–3 км друг от друга: переезд считается как поездка (≈ 15 км/ч + 5 мин) вместо 30 мин автобуса; на чём – неважно. Раздают пешком.', bikeLbl:'Переезды между местами', yes:'да', byBike:'На велосипеде (Google Maps)', farBike:'До маршрута ещё {d} – доехать на велосипеде?' });
Object.assign(T.de, { sideFailed:'In diesen Orten wurden innerhalb der Grenze keine Straßen mit Briefkästen gefunden, sie sind nicht in der Route: {list}. Bitte den Ort entfernen und selbst auf der Karte einzeichnen.' });
Object.assign(T.ru, { sideFailed:'В этих местах внутри границы не найдено улиц с ящиками, они не вошли в маршрут: {list}. Удалите место и нарисуйте его на карте сами.' });
Object.assign(T.de, { draftQ:'Entwurf fortsetzen?', draftText:'Es gibt einen nicht gespeicherten Auftrag „{name}“. Weitermachen, wo du aufgehört hast?', draftYes:'Fortsetzen' });
Object.assign(T.ru, { draftQ:'Продолжить черновик?', draftText:'Есть несохранённый заказ «{name}». Продолжить с того места?', draftYes:'Продолжить' });
Object.assign(T.de, { tripsBike:'Radwege', tripsBus:'Bus/Bahn-Fahrten' });
Object.assign(T.ru, { tripsBike:'Велопереезды', tripsBus:'Переезды на автобусе' });
Object.assign(T.de, { travelLbl:'Zwischen den Orten', travel_bus:'Bus / Bahn (30 Min. pro Fahrt)', travel_bike:'Fahrrad (≈ 15 km/h)', travel_car:'Auto (≈ 40 km/h)', travelHint:'So werden die Fahrten zwischen Hauptstadt und Nebenstädten gerechnet (echte Straßenlänge, + 5 Min. pro Fahrt). Verteilt wird zu Fuß.', byCar:'Mit dem Auto (Google Maps)' });
Object.assign(T.ru, { travelLbl:'Между местами', travel_bus:'Автобус / поезд (30 мин на поездку)', travel_bike:'Велосипед (≈ 15 км/ч)', travel_car:'Машина (≈ 40 км/ч)', travelHint:'Так считаются переезды между основным городом и доп. городами (реальная длина дорог, + 5 мин на поездку). Раздают пешком.', byCar:'На машине (Google Maps)' });
Object.assign(T.de, { mustTooMany:'Die Nebenstädte mit „alle Briefkästen“ haben zusammen ≈ {mb} Briefkästen, aber es gibt nur {f} Flyer. In Schritt 1 auf den Namen tippen und eine Flyerzahl eintragen – oder mehr Flyer eingeben.' });
Object.assign(T.ru, { mustTooMany:'В доп. городах с «все ящики» вместе ≈ {mb} ящиков, а флаеров всего {f}. В шаге 1 нажмите на название и впишите число флаеров – или увеличьте число флаеров.' });
Object.assign(T.de, { sideOwnKm:'mit Anfahrt · {km} km', splitHint:'Die Flyer werden gleichmäßig auf die Orte verteilt (wo weniger Briefkästen sind, bekommen die anderen mehr): {list}' });
Object.assign(T.ru, { sideOwnKm:'с переездом · {km} км', splitHint:'Флаеры поровну разделены по местам (где ящиков меньше, остаток получают другие): {list}' });
Object.assign(T.de, { tabSettings:'Einstellungen' });
Object.assign(T.ru, { tabSettings:'Настройки' });
Object.assign(T.de, { takenT:'Schicht auf anderem Handy', takenQ:'Deine Schicht läuft jetzt auf einem anderen Handy weiter. Hier wurde sie beendet, nichts wird doppelt gezählt.', otherPhoneT:'Schicht läuft schon', otherPhoneQ:'Mit deinem Konto läuft seit {t} eine Schicht auf einem anderen Handy. Hier starten? Dort wird sie dann beendet.', otherPhoneYes:'Hier starten', autoPaused:'Automatisch pausiert: keine Bewegung seit {t}. Tippe auf „Weiter“, wenn du weitermachst.' });
Object.assign(T.ru, { takenT:'Смена на другом телефоне', takenQ:'Твоя смена продолжается на другом телефоне. Здесь она завершена, ничего не считается дважды.', otherPhoneT:'Смена уже идёт', otherPhoneQ:'С твоего аккаунта с {t} идёт смена на другом телефоне. Начать здесь? Там она завершится.', otherPhoneYes:'Начать здесь', autoPaused:'Автопауза: нет движения с {t}. Нажми «Продолжить», когда продолжишь.' });
Object.assign(T.de, { progLbl:'Fortschritt' });
Object.assign(T.ru, { progLbl:'Выполнено' });
Object.assign(T.de, { invSection:'Neue Mitarbeiter einladen & Login-Links' });
Object.assign(T.ru, { invSection:'Пригласить работников и логин-ссылки' });
Object.assign(T.de, { waLogin:'Mit WhatsApp anmelden', waConfirm:'Nummer per WhatsApp bestätigen', waTitle:'Per WhatsApp bestätigen', waHint:'Tippe auf „WhatsApp öffnen“ und schicke die fertige Nachricht ab. Danach geht es hier von selbst weiter.', waOpen:'WhatsApp öffnen', waWait:'Warte auf deine Nachricht …', waTimeout:'Zeit abgelaufen. Bitte noch einmal versuchen.', waOff:'WhatsApp-Bestätigung ist noch nicht eingerichtet.', waPhoneOk:'Nummer bestätigt: {p}', e_wa_expired:'Code abgelaufen. Bitte noch einmal versuchen.' });
Object.assign(T.ru, { waLogin:'Войти через WhatsApp', waConfirm:'Подтвердить номер через WhatsApp', waTitle:'Подтверждение через WhatsApp', waHint:'Нажми «Открыть WhatsApp» и отправь готовое сообщение. После этого всё продолжится здесь само.', waOpen:'Открыть WhatsApp', waWait:'Ждём твоё сообщение …', waTimeout:'Время вышло. Попробуй ещё раз.', waOff:'Подтверждение через WhatsApp ещё не настроено.', waPhoneOk:'Номер подтверждён: {p}', e_wa_expired:'Код устарел. Попробуй ещё раз.' });
Object.assign(T.de, { prevWorker:'Vorher: {n} · {km} · {h} h' });
Object.assign(T.ru, { prevWorker:'Раньше: {n} · {km} · {h} ч' });
Object.assign(T.de, { oneDayHint:'Alles zusammen ≈ {h} Std. – das schafft 1 Mitarbeiter an 1 Tag.', fitsOne:'Passt in 1 Tag.' });
Object.assign(T.ru, { oneDayHint:'Всего ≈ {h} ч – это сделает 1 работник за 1 день.', fitsOne:'Укладывается в 1 день.' });
Object.assign(T.de, { startAnywhere:'Darf überall starten (ohne Startpunkt-Prüfung)' });
Object.assign(T.ru, { startAnywhere:'Может начинать где угодно (без проверки точки старта)' });
Object.assign(T.de, { mergeHint:'{n} hat {k} Routen in diesem Auftrag.', mergeBtn:'Zu einer Route zusammenlegen', mergeQ:'Die {k} Routen von {n} werden eine Route: die Tage folgen nacheinander, Erledigtes und alle Schichten bleiben. {n} wählt danach die Tage neu.' });
Object.assign(T.ru, { mergeHint:'У {n} {k} маршрута в этом заказе.', mergeBtn:'Объединить в один маршрут', mergeQ:'{k} маршрута {n} станут одним: дни идут друг за другом, сделанное и все смены сохраняются. Потом {n} заново выбирает дни.' });
Object.assign(T.de, { dayDone:'erledigt', restLine:'Noch offen: ≈ {km} · {h} Std.', restNone:'Alles erledigt' });
Object.assign(T.ru, { dayDone:'сделано', restLine:'Осталось: ≈ {km} · {h} ч', restNone:'Всё сделано' });
Object.assign(T.de, { redayBtn:'Rest neu auf Tage verteilen', redayHint:'Die Route bleibt gleich, Erledigtes bleibt erledigt und wird übersprungen. Die offene Arbeit wird gleichmäßig auf die Tage verteilt; der Mitarbeiter wählt die Tage neu.', redayN:'Anzahl Tage', openH:'offen ≈ {h} Std.' });
Object.assign(T.ru, { redayBtn:'Распределить остаток по дням', redayHint:'Маршрут тот же, сделанное остаётся сделанным и пропускается. Оставшаяся работа делится поровну на дни; работник заново выбирает дни.', redayN:'Сколько дней', openH:'осталось ≈ {h} ч' });
Object.assign(T.de, { stCancelled:'Storniert', cancelTask:'Stornieren', cancelTaskQ:'Auftrag stornieren? Er verschwindet bei den Mitarbeitern, Gelaufenes bleibt gespeichert. „Wieder öffnen“ macht es rückgängig.' });
Object.assign(T.ru, { stCancelled:'Отменён', cancelTask:'Отменить заказ', cancelTaskQ:'Отменить заказ? Он пропадёт у работников, пройденное останется сохранённым. «Открыть снова» вернёт его.' });
Object.assign(T.de, { replanWork:'Routen neu planen (läuft schon)', replanWorkHint:'Gelaufenes bleibt gespeichert und zählt auf den neuen Routen als erledigt. Die Mitarbeiter werden benachrichtigt.', replanLive:'Gerade ist jemand in diesem Auftrag unterwegs. Neu planen geht nach dem Feierabend.', routeChangedTitle:'Route geändert: {title}', routeChangedBody:'Der Auftrag wurde neu geplant. {date}≈ {mb} Briefkästen · {km}. Bitte Seite aktualisieren.', routeChangedDays:'Der Auftrag wurde neu geplant und braucht jetzt mehr Tage. Bitte die Route ansehen und die Tage neu wählen.' });
Object.assign(T.ru, { replanWork:'Пересчитать маршруты (заказ уже идёт)', replanWorkHint:'Пройденное сохраняется и на новых маршрутах считается сделанным. Работники получат уведомление.', replanLive:'Сейчас кто-то идёт по этому заказу. Пересчитать можно после Feierabend.', routeChangedTitle:'Маршрут изменён: {title}', routeChangedBody:'Заказ пересчитан. {date}≈ {mb} ящиков · {km}. Обновите страницу.', routeChangedDays:'Заказ пересчитан, и теперь нужно больше дней. Посмотрите маршрут и выберите дни заново.' });
Object.assign(T.de, { noQuota:'Ohne Quote (keine Tempo-Warnungen, z. B. mit Auto)', driveTip:'Fahrt · {km} (zählt als Arbeitszeit, nicht als verteilt)' });
Object.assign(T.ru, { noQuota:'Без квоты (без предупреждений о темпе, напр. с машиной)', driveTip:'Поездка · {km} (рабочее время, но не раздача)' });
Object.assign(T.de, { tabStats:'Statistik' });
Object.assign(T.ru, { tabStats:'Статистика' });
Object.assign(T.de, { fRange:'Zeitraum', fWho:'Mitarbeiter suchen' });
Object.assign(T.ru, { fRange:'Период', fWho:'Поиск работника' });
Object.assign(T.de, { joinPhone:'Handynummer', joinPhoneHint:'Damit du dich später auf jedem Handy wieder in dasselbe Konto einloggst.', joinPhoneNeed:'Bitte deine Handynummer eingeben.', joinPhoneTaken:'Mit dieser Nummer gibt es schon ein Konto.', joinToLogin:'Anmelden' });
Object.assign(T.ru, { joinPhone:'Номер мобильного', joinPhoneHint:'Чтобы потом на любом телефоне входить в этот же аккаунт.', joinPhoneNeed:'Введите номер мобильного.', joinPhoneTaken:'С этим номером аккаунт уже есть.', joinToLogin:'Войти' });
Object.assign(T.de, { more:'Mehr' }); Object.assign(T.ru, { more:'Ещё' });
Object.assign(T.de, { nobodyLiveHint:'Gerade ist niemand unterwegs.', chipsAll:'Alle {n} anzeigen', chipsLess:'Nur Unterwegs' });
Object.assign(T.ru, { nobodyLiveHint:'Сейчас никто не в пути.', chipsAll:'Показать всех ({n})', chipsLess:'Только в пути' });
Object.assign(T.de, { waLoginHint:'WhatsApp öffnet sich mit einer fertigen Nachricht – einfach absenden. So bestätigst du deine Nummer, ohne SMS.', noWaYet:'Die Anmeldung per WhatsApp wird gerade eingerichtet. Bis dahin meldest du dich mit dem Login-Link von deinem Admin an.' });
Object.assign(T.ru, { waLoginHint:'Откроется WhatsApp с готовым сообщением — просто отправьте его. Так номер подтверждается без SMS.', noWaYet:'Вход через WhatsApp сейчас настраивается. До этого входите по Login-Link от вашего админа.' });
Object.assign(T.de, { mergeTasks:'Aufträge zusammenführen', mergeHint:'Routen, Arbeitstage, GPS-Spuren und Mitarbeiter der gewählten Aufträge kommen in „{title}“. Die Flyer werden addiert. Lässt sich rückgängig machen.', mergeGo:'Zusammenführen', mergeNone:'Bitte mindestens einen Auftrag wählen.', mergeQ:'{n} Auftrag/Aufträge in „{title}“ zusammenführen?', mergeDone:'{n} Auftrag/Aufträge zusammengeführt' });
Object.assign(T.ru, { mergeTasks:'Объединить заказы', mergeHint:'Маршруты, рабочие дни, GPS-треки и работники выбранных заказов перейдут в «{title}». Флаеры суммируются. Можно отменить.', mergeGo:'Объединить', mergeNone:'Выберите хотя бы один заказ.', mergeQ:'Объединить {n} заказ(а) в «{title}»?', mergeDone:'Объединено заказов: {n}' });
Object.assign(T.de, { adjust:'anpassen', flDoneManual:'Angabe vom {d}', stillWorking:'Arbeit läuft weiter', flDoneHint:'Wie viele Flyer sind wirklich verteilt (z. B. nach gezählten Paketen)? Leer lassen = Schätzung aus den GPS-Spuren.', flDoneAuto:'automatisch (GPS)', flDoneBad:'Bitte eine Zahl eingeben.' });
Object.assign(T.ru, { adjust:'изменить', flDoneManual:'данные от {d}', stillWorking:'работа идёт дальше', flDoneHint:'Сколько флаеров реально роздано (например, по пересчитанным пачкам)? Пусто = оценка по GPS-трекам.', flDoneAuto:'автоматически (GPS)', flDoneBad:'Введите число.' });
