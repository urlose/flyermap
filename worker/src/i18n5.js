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
