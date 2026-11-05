// English (01.11.2026). Same keys as T.de; anything missing falls back to German (see t() in i18n.js).
import { T } from './i18n.js';
T.en = {
  tabMap:'Map', tabPeople:'Team', tabProfile:'Profile', tabTasks:'Orders',
  back:'Back', save:'Save', saved:'Saved', cancel:'Cancel', del:'Delete', close:'Close', refresh:'Refresh',
  language:'Language', logout:'Sign out', logoutQ:'Sign out?', privacy:'Privacy',
  today:'today', tomorrow:'tomorrow', noDate:'no date', km:'km', m:'m', h:'h', min:'min',
  call:'Call', whatsapp:'WhatsApp', write:'Message', search:'Search', notFound:'Nothing found', searchDown:'Search unavailable',
  e_net:'No internet. Please try again.',
  welcomeTitle:'Flyer distribution', welcomeText:'Routes, orders and reports for the team.',
  iWorker:'I distribute flyers', iAdmin:'I am an admin',
  register:'Register', haveAccount:'I already have an account',
  name:'First and last name', phone:'Phone / WhatsApp', cities:'Cities where you can work', citySearch:'Enter a city',
  pin:'4-digit PIN', pinHint:'Only needed to restore your account on a new phone.', create:'Create profile',
  regAgree:'By registering you accept the', loginTitle:'Sign in', loginText:'Phone and PIN from your registration.', login:'Sign in',
  adminLogin:'Admin sign-in', email:'Email', password:'Password', adminSignup:'Create account',
  adminNoAccess:'This account is not an admin. Ask an admin to invite your email, then sign in again.', adminConfirm:'Account created. Confirm your email via the link and sign in.',
  badLogin:'Wrong email or password', pass8:'Password: at least 8 characters',
  e_name_required:'Please enter your name', e_phone_required:'Please enter a phone number', e_pin_4_digits:'The PIN must have 4 digits', e_city_required:'Add at least one city',
  e_phone_exists:'This number is already registered. Tap “I already have an account”.', e_wrong:'Wrong phone or PIN',
  e_too_many_attempts:'Too many attempts. Please wait 15 minutes.', e_invalid_token:'Your profile was deleted. Please register again.',
  myTasks:'My orders', noTasks:'No orders yet. As soon as the admin assigns you, the order appears here.',
  yourTask:'Your order', taskInfo:'Order info', place:'Place', date:'Date', route:'Route', duration:'Duration', note:'Note',
  routeInfo:'{km} · ≈{h} h', startRoute:'Start route', directions:'Way to the start point', freeRoute:'Route without an order',
  noPlan:'There is no ready route for this order — walk the area yourself.',
  recording:'Recording', time:'Time', dist:'Distance', progress:'Route', stop:'Finish for today',
  stopQ:'End the route?', stopText:'The route is saved and sent to the admin.', stopYes:'Yes, end it',
  synced:'Everything sent', pending:'{n} points not sent yet — they are sent as soon as there is internet', gpsWait:'Looking for GPS…', onRoute:'You are on your way',
  followLine:'Follow the route line — what you have walked turns green.',
  bgTitle:'FlyerMap is recording your route', bgMsg:'Tap to open the app',
  locDenied:'No location access', locDeniedText:'Open Settings → FlyerMap → Location and choose “While using” or “Always”.', openSettings:'Open settings',
  demoWalk:'Demo walk', demoStop:'Stop demo', demoRunning:'Demo: walking the route…',
  webNote:'Web version: keep the screen on. The iPhone app also records with the screen locked.',
  delAcc:'Delete account', delAccQ:'Delete your profile and all routes for good?', delAccYes:'Delete for good',
  noActive:'No active order right now', openTasks:'Open orders',
  worker:'Distributor', admin:'Administrator',
  liveNow:'{n} on the way', nobodyLive:'Nobody is on the way right now', updated:'updated {x}', justNow:'just now', minAgo:'{n} min ago', hAgo:'{n} h ago', noData:'no data',
  workersN:'Team ({n})', whoCanGo:'Who can get to this city', whoPh:'e.g. Essen', searchNamePhone:'Name or phone', canReach:'{n} people can reach {city}', reset:'Reset',
  zoneChip:'Area {n} min', noWorkers:'No registrations yet. Team members appear here as soon as they register in the app.',
  zoneLabel:'How far by public transport', notes:'Notes', delWorkerQ:'Delete {name} and all routes?', lastActive:'active: {a}',
  createTask:'Create order', createTaskSub:'Start point, area and routes for the team', tasks:'Orders', noOpenTasks:'No orders yet.', finished:'Finished',
  routeCreate:'Route planning', searchAddr:'Address or start location',
  tapMap:'Search for an address or tap the map — that is the start point. You can move it later with “Change start point”.',
  buildingZone:'Calculating area…', walkMin:'minutes on foot', workersCount:'Team members', title:'Title', notesPh:'What to distribute, how many, where to pick up',
  streetsLoading:'Loading the streets of the area…', streetsFail:'Streets not loaded ({e}). The order can be saved without routes.',
  planSummary:'{km} of streets in the area · {n} people recommended', planRoute:'Route {n}', nobody:'— not assigned —', outZone:'outside',
  saveTask:'Create order', needTitle:'Please enter a title', done:'{p} % done', walkZone:'Area {n} min', finish:'Close', reopen:'Reopen',
  delTaskQ:'Delete the order and its routes?', routesOf:'Routes of the team', noPlans:'No routes.',
  invite:'Hi {name}! There is work: {title}{date}. The route is already in the FlyerMap app.', active:'running',
  adminTools:'Tools', inviteAdmin:'Invite admin', inviteSent:'Invitation saved. The person registers with this email.', desktop:'PDF / Excel reports in the web panel',
  demo:'Demo', demoCreate:'Create test data', demoLive:'Live demo', demoStopLive:'Stop', demoClean:'Delete test data', demoCleanQ:'Delete the test team (demo) and test orders?',
  demoWorking:'Creating… (calculating routes)', demoCreated:'Done: 6 team members and one order with routes.', demoExists:'Test data already exists.', demoNeed:'Create the test data first.',
  demoProgress:'On the way: {p} %', demoDone:'Demo finished.', demoCleaned:'Test data deleted.',
  flyers:'Flyers', mailboxes:'Mailboxes', loadingArea:'Loading streets and buildings…', loadingMore:'Extending the area…', calculating:'Calculating routes…',
  planSum:'≈ {mb} mailboxes · {km} walk · ≈ {h} h in total', areaSmall:'There are only ≈ {mb} mailboxes around.',
  tooBig:'Too big: longest route ≈ {h} h, available {lim} h ({d} days).', reduceTo:'Reduce to {f} flyers', moreWorkers:'Or assign more people.', fitsOk:'Fits into {d} days.',
  startDate:'Start', hoursDay:'Working day, net (h)', quota:'Quota: metres per 30 min', flyersCount:'Number of flyers', routeLine:'{km} · ≈ {h} h · {mb} mailboxes', daysN:'{n} day(s)',
  startLoc:'Start point', dist2:'Distance', mbShort:'boxes', assigned:'Order assigned',
  stOffered:'waiting for an answer', stAccepted:'Accepted', stDeclined:'Declined', stDone:'done', workDays:'Working days',
  replaceHint:'Choose a new team member: they get the rest of the route.', flyersDone:'≈ {a} of {b} flyers', quotaLow:'below quota', quotaHigh:'very fast', onPause:'Break',
  fFrom:'From', fTo:'To', fCity:'City', fDistrict:'District', fAll:'All', fOpen:'Open', fDone:'Finished', filter:'Filter', noMatch:'No orders for this filter.',
  newTaskTitle:'New order: {title}', newTaskBody:'{date}{mb} mailboxes · {km}. Please look at the route and accept it.',
  phoneLogin:'Phone number', sendCode:'Send code by SMS',
  smsHint:'You get a one-time SMS with a code to confirm your number. After that you stay signed in.',
  codeTitle:'Enter code', codeSent:'We sent a code to {phone}.', verify:'Confirm', resend:'Send code again', resendIn:'Send again in {s} s',
  wrongCode:'Wrong or expired code.', smsFail:'The SMS could not be sent.', smsPending:'The SMS service is still waiting for approval by the provider. Please try again later.',
  smsNotConfigured:'Sending SMS is not set up yet (admin: connect an SMS provider in Supabase).',
  badPhone:'Please enter a German mobile number, e.g. +49 170 1234567 (SMS codes only go to German numbers).',
  asWho:'How do you want to work?', asAdmin:'As admin', asWorker:'As distributor', switchToWorker:'Work as distributor', switchToAdmin:'Switch to admin',
  emailAdmin:'Admin sign-in with email', yourData:'Your details', changeNumber:'Other number', invitePhone:'Phone number of the new admin',
  invitePhoneSent:'Invited. When signing in with this number, “As admin” appears.', continue:'Continue',
  stNew:'New – please answer', accept:'Accept', decline:'Decline', pickDays:'Choose working days', dayN:'Day {n}',
  declineQ:'Decline the order?', declineText:'The admin will give the order to someone else.', yourDates:'Your working days', needAccept:'Please accept the order first.',
  inbox:'Notifications', noInbox:'No notifications.', pause:'Break', resumeBtn:'Continue', pauseRunning:'On a break (unpaid)', netTime:'Working time', flyersEst:'Flyers ≈',
  quotaLine:'Quota: {a} / {b} m in 30 min', summaryTitle:'Done for today!', summaryBody:'Working time {h} · distance {d} · ≈ {f} flyers distributed.',
  nextDay:'Next working day: {date}', noNext:'No further day planned.', flyersOf:'{a} of {b}', mbApprox:'≈ {n} mailboxes', quotaInfo:'Quota', dates:'Dates', ok:'OK',
  switchHint:'You are also an admin.', taskTotal:'Flyers', dayHint:'Duration ≈ {h} h = {n} working day(s)',
  e_date_required:'Please choose a separate date for each day.', e_plan_not_found:'This order is no longer assigned to you.', e_not_authenticated:'Please sign in again.',
  walkedLbl:'Walked', newNotif:'New notification: new order', offlineN:'{n} not on the way', settings:'Settings',
  mapSearchPh:'Search a city – team members nearby', nearN:'{n} near {c}', nearNone:'Nobody within {k} km of {c}', livesIn:'lives in {c}',
  mapSlow:'The map server does not answer (overloaded)', retrying:'The map server is slow – trying again…', retryBtn:'Try again',
  testTitle:'Open the distributor view', testHint:'Without an SMS code: opens the view of a test distributor (assign orders, accept, walk, navigation). Back to admin via “Profile”.',
  testOwn:'Open with my number', testCreate:'Create a new test distributor', testWorkerName:'Test distributor',
  editTask:'Edit order', replan:'Re-plan flyers / team / routes', editNoReplan:'Re-planning is only possible as long as nobody has walked yet. You can still change texts, date and quota.',
  startDayN:'Start day {n}', dayDone:'Day {n} is done – back to the start.', dayStatus:'Today: day {n}', navOpen:'Navigation', navStart:'Follow the line',
  navS:'Continue straight', navSL:'Slight left', navSR:'Slight right', navL:'Turn left', navR:'Turn right', navU:'Turn around', navEnd:'End of the route – back at the start point',
  sugWorkers:'Recommendation: {n} people, so everything is done in {d} days.', applySug:'Apply',
  rvBig:'Full screen', rvNames:'Names', rvFit:'Center', rvOnlyMap:'Map only', rvShowInfo:'Show info', rvPlan:'Plan', rvDone:'Done', rvGps:'GPS track', rvDistributor:'Distributor',
  rvDist:'Walked', rvWork:'Working time', rvFlyers:'Flyers distributed', rvDayShare:'Route on this day', rvDayShare2:'Route done', rvDays:'Working days', rvNoTrack:'There is no GPS track for this day.',
  imprint:'Legal notice', legalAsOf:'As of:', trackDeleted:'GPS track deleted (older than 6 months)',
  startCheck:'Check start point', startLocating:'Finding your position …', notAtStart:'Not at the start point yet',
  startTooFar:'You are {d} away from the start point. The working day only starts at the start point (within {r}).',
  startNoGps:'Your position could not be found. Turn on location and check again.', toStart:'Way to the start point', checkAgain:'Check again', startAnyway:'Start anyway (test)',
  workedWhen:'Who worked when and where', dToday:'Today', dYesterday:'Yesterday', d7:'7 days', workedSum:'{w} people · {d}', filtered:'Filter on', showAllDays:'show all days',
  daysSum:'{n} days · {km} · {h} h', daysSum1:'1 day · {km} · {h} h', noDays:'No working days yet.', noDaysRange:'No working days for this filter.',
  changeStart:'Change start point', pickStartNow:'Tap the new start point on the map · Cancel',
  navIn:'In {d}', navOnto:'onto {name}', navAhead:'Continue on {name}', navOff:'Off the route ({d})', navExt:'Open in maps app', navThen:'Then: {s}',
  theme:'Appearance', theme_system:'System', theme_light:'Light', theme_dark:'Dark',
  offlineBanner:'No internet connection. Your walk is saved and sent later.',
  stLive:'On the way', stPlanned:'Planned', stNoWorkers:'No team', stDoneTask:'Finished', kTotal:'Total', kNew:'New', mapOrders:'Orders', mapOrdersN:'Open orders ({n})',
  accountSettings:'Account & settings', account:'Account', loadingShort:'Loading …', staleData:'No connection · as of {x}', netErr:'No connection. Please try again later.',
  wzStart:'Start', wzRoute:'Route', wzTime:'Time', wzTeam:'Team', wzReview:'Review', next:'Next', startPoint:'Start point', panel:'Panel', dayShort:'day',
  assignHint:'Choose a team member for each route. Routes without anybody are shown to all distributors of your company as a “free route”, and they can take them themselves.',
  assignedN:'{a} of {n} assigned',
  gps_wait:'Looking for GPS …', gps_ok:'GPS ±{m} m', gps_weak:'GPS inaccurate (±{m} m)', gps_stale:'GPS outdated', gps_denied:'No location access', gps_off:'Location is off',
  copy:'Copy', copied:'Copied',
  mustTitle:'Priority areas', mustHint:'Part of the flyers must be distributed here – you decide how many. They count towards the total; the rest goes around the start point as usual.',
  mustAdd:'Draw an area', mustN:'Area {n}', mustMb:'≈ {mb} mailboxes', mustSum:'{n} · ≈ {mb} mailboxes', mustDrawHint:'Tap the corners of the area on the map', mustCorners:'{n} corners (min. 3)',
  mustUndo:'Undo', mustTooMany:'The priority areas have ≈ {mb} mailboxes, but there are only {f} flyers. Enter more flyers or make an area smaller.', mustDone:'Done',
  handoverHint:'Welcome! Please enter your name, your mobile number and the cities where you can work, then tap “Save”.', handoverPhone:'Your mobile number',
  e_phone_taken:'This number is already registered with FlyerMap.', e_phone_invalid:'Please enter a German mobile number.',
  loginLink:'Login link to pass on', loginLinkHint:'Whoever opens this link is signed in to this account. Only send it to the person the account is for.',
  newUserQ:'How do you want to use FlyerMap?', newUserWorker:'I distribute flyers', newUserWorkerSub:'You have a company code or link from your company.',
  newUserFirm:'I am registering my company', newUserFirmSub:'You plan orders and assign distributors.',
  firmRegTitle:'Register company', firmRegHint:'Your distributors see these details in the privacy policy: your company is responsible for their data.', firmRegBtn:'Register company',
  fmName:'Company name with legal form', fmNamePh:'e.g. Sample Leaflets Ltd', fmStreet:'Street and number', fmZip:'Postcode', fmCity:'City', fmRep:'Represented by', fmRepPh:'Managing director or owner',
  fmEmail:'Email for data protection questions', fmPhone:'Phone (optional)', fmDpo:'Data protection officer (optional)', fmDpoPh:'Name and contact', fmWorksCouncil:'We have a works council',
  fmAvvAccept:'On behalf of the company I accept the data processing agreement (AVV).', fmAvvRead:'Read the AVV', avvTitle:'Data processing agreement (AVV)',
  firm:'Company', firmMissing:'Please enter your company details – they appear in your distributors’ privacy policy.', firmAvvMissing:'Please accept the data processing agreement (AVV).',
  firmCode:'Company code for distributors', firmCodeHint:'New distributors enter this code when registering, or open the link.',
  firmInviteText:'Register with FlyerMap for {firm}: {link} – company code: {code}', avvAccepted:'AVV accepted on {d} ({v})', avvNotAccepted:'AVV not accepted yet',
  firmEdit:'Edit company details', firmNewCode:'New code', firmNewCodeQ:'The old code and link stop working. Distributors who already registered stay.',
  joinCode:'Company code', joinCodeHint:'8 characters – you get it from your company (or open their link).', joinCodeOk:'Company: {name}', joinCodeBad:'Unknown code', myFirm:'Company',
  e_company_name_required:'Please enter the company name.', e_company_street_required:'Please enter street and number.', e_company_zip_required:'Please enter a 5-digit postcode.',
  e_company_city_required:'Please enter the city.', e_company_rep_required:'Please state who represents the company.', e_company_email_required:'Please enter a valid email address.',
  e_avv_required:'Please accept the AVV.', e_avv_outdated:'The AVV has changed – please reload the app.', e_code_invalid:'Unknown company code. Please ask your company.',
  e_phone_other_company:'This number is already registered with another company.', e_already_admin:'You are already the admin of a company.',
  offersQ:'Job offers from other companies?', offersYes:'Yes, I want to get job offers', offersNo:'No, thanks',
  offersQSub:'Other companies on FlyerMap then see your name, your cities and your phone number and can offer you work – no locations and no working days. You can turn this off in your profile at any time.',
  offersOptIn:'I also want to get job offers from other companies (voluntary).',
  offersOptInSub:'Other companies on FlyerMap then see your name, your cities and your phone number – no locations and no working days. You can turn this off in your profile at any time.',
  poolTitle:'Distributors of other companies (open to offers)', poolHint:'These distributors agreed to get job offers from other companies.', poolNone:'Nobody at the moment.',
  poolMsg:'Hello, we found you on FlyerMap and would have work for you.',
  master:'Platform – all companies', msCompanies:'Companies', msWorkers:'Distributors', msOpen:'Open to offers', msNoName:'(no name)', msNoAvv:'AVV missing', msNoData:'No company details', msNone:'No companies',
  msCounts:'{a} admin · {w} distributors · {o} orders', msLast:'last active {a}', msSearch:'Name, phone or company', msOffersOk:'open to offers', msMasters:'Master admins', msYou:'you',
  msRemove:'Remove', msRemoveQ:'This person loses access to all companies.', msInvited:'invited', msAdd:'Add master admin', msAddHint:'Phone number or email of an existing FlyerMap account.',
  msNoAccount:'There is no account for this number or email yet. The person has to sign in once first.', msBadIdent:'Please enter a phone number or email.', msAdded:'Added', msInvitedToast:'Invited – applies at the first sign-in',
  mustNTitle:'How many flyers in this area?', mustNHint:'Distribution happens in the part of the area closest to the start point.', mustAll:'All mailboxes in the area', mustAllShort:'all mailboxes',
  mustNFly:'{n} flyers', mustAvail:'≈ {mb} mailboxes in the area', mustFewer:'fewer than wanted', change:'Change',
  zoneTitle:'Distribution area', zoneAuto:'automatic', zoneOwn:'drawn by you',
  zoneHint:'Automatic: a compact area around the start point. If you don’t like it, draw the area yourself – then only that area gets flyers.',
  zoneHintOwn:'Flyers only go inside the drawn area (and in the priority areas).', zoneDraw:'Draw the area yourself', zoneRedraw:'Draw again', zoneBackAuto:'Back to automatic',
  zoneDrawHint:'Tap the corners of your distribution area on the map', zoneSmall:'The drawn area only has ≈ {mb} mailboxes, but there are {f} flyers. Draw it larger or use fewer flyers:',
  openRoutes:'Free routes', openHint:'Nobody is assigned here yet – you can take a route yourself.', stOpen:'Free',
  openDetailHint:'Nobody has this route yet. Choose your days and take it – the dispatcher sees it right away.', openRoute:'Free route', claim:'Take route', claimed:'Route taken',
  e_plan_taken:'Somebody else just took this route.', e_already_in_task:'You already have a route in this order.',
  area:'Area', routeLen:'Length', mapBig:'Big map', mapSmall:'Details',
  rvLive:'Where now', checkpoints:'Checkpoints', cpTitle:'Day {d} · section {n} · {p} % done', rerouted:'Route adjusted to your way', contDayN:'Continue day {n}', navLeft:'{n} % still open · nearest street {d}', navToStart:'To the start of the route · {d}', navBack:'Back to the route · {d}', navToSub:'Follow the purple line · map button on the right = walking directions',
  rvDoneBefore:'Already done', haveLink:'I have a login link', haveLinkHint:'Paste the link you got from the admin (e.g. via WhatsApp).', haveLinkGo:'Log in', haveLinkBad:'This is not a valid login link.', rvOutside:'of these outside the routes', dayEndBtn:'Finish day {n} · start day {m}', dayEndQ:'Finish day {n}?', dayEndText:'About {p} % of day {n} is still open. These rests are marked as "not needed" (the admin sees this) and day {m} starts right away.', dayEndYes:'Start day {m}', dayEndDone:'Going on with day {m}', navTarget:'Next target', skipBtn:'Not needed', skipQ:'Skip this section?', skipText:'The section marked in red (≈ {d}) will be marked as "not needed", e.g. a road without houses or houses already served from another street. The admin sees this.', skipYes:'Skip', skipDone:'Skipped – route adjusted', skipNone:'No open section ahead of you', rvSkipped:'Skipped', walkedLine:'Walked: {km} · {h} h working time', walkedLive:'on the way now',
};
T.en.handedLbl = 'Distributed';
T.en.startTooFar2 = 'You are {d} away from the start point and not at an open part of your route either. You can start at the start point or right at a street of your route that is still open (within {r}).';
T.en.hoursLbl = 'Working time (done / planned)';
Object.assign(T.en, { whyLbl:'Why?', whyPh:'Describe the reason briefly', whyNeed:'Please pick or write a reason.', why1:'No houses / road only', why2:'No access (private, gate, construction)', why3:'Already served (from another street)', why4:'Dangerous (no sidewalk, fast road)', why5:'No time / out of flyers' });
Object.assign(T.en, { chgDates:'Change days', datesChangedTitle:'New working days: {title}' });
Object.assign(T.en, { allLinks:'Login links of all workers' });
T.en.pauseLbl = 'Break';
Object.assign(T.en, { openWorker:'Open worker page', swapWorker:'Change' });
Object.assign(T.en, { mainCity:'Main town', sideTowns:'More places (optional)', sideTownsHint:'Where the customer also wants flyers – type the name, the place is taken over with its borders as a mandatory area.', townSearch:'Town / district / village', placeLoading:'Loading borders …', placeTooFar:'This place is more than {km} km from the start – better create a separate order for it.', placeCircle:'No borders found – a circle around the centre was used. Draw it yourself if needed.' });
Object.assign(T.en, { pwChange:'Change password', pwNew:'New password', pwAgain:'Repeat new password', pwShort:'At least 8 characters.', pwDiff:'The passwords do not match.' });
Object.assign(T.en, { sideTitle:'More places (with travel)', sideAdded:'{name} is further away – own start, travel by bus / train', sideOwn:'with travel · {km} km · {n} flyers', sideOwnHint:'Places further away stay in the same order with their own start. Days are split by time (e.g. the rest of the main town and then this place on the same day). The worker gets bus / train suggestions for the trip.', loadingSide:'Loading more places …' });
Object.assign(T.en, { busTrain:'Bus & train (Google Maps)', appleMaps:'Apple Maps', onFoot:'Rather walk', farAway:'Still {d} to the route – take a bus or train?' });
Object.assign(T.en, { newLinkAcc:'Add worker with login link', newLinkHint:'As long as SMS login is not active: create the account and send the link to the worker. Name, phone and cities are entered by the worker in the profile.', nameOpt:'Name (optional)', cityOpt:'Town (optional)', createLink:'Create account', newWorkerName:'New worker' });
Object.assign(T.en, { sideTowns:'More towns (optional)', sideTownsHint:'Where the customer also wants flyers: type a name (its borders are used) or draw it on the map. Places further away get their own start and one worker. The route is calculated in the next step.', drawOwn:'Draw on the map', areaN:'Area {n}', sideNeedStart:'First search the start address above (main town).' });
Object.assign(T.en, { busHint:'By bus / train instead of walking (no mailboxes on the way): {list}' });
Object.assign(T.en, { joinTitle:'Create account', joinFirm:'You were invited by {name}. Enter your name – phone and towns follow in your profile.', joinGo:'Create account', inviteTitle:'Invitation link for new workers', inviteHint:'Send this link to new workers (e.g. via WhatsApp). Whoever opens it creates their own account in your firm – no SMS. New link: renew the code under Settings → Firm.', inviteMsg:'Hi! Here you can create your account for the flyer distribution: {link}' });
T.en.noPhoneYet = 'Phone number not entered yet';
Object.assign(T.en, { addrMain:'Start address in the main town', mainCityAuto:'taken from the address', startOnMap:'Start point set on the map.' });
T.en.quotaHours = 'Hours are calculated from it: route length ÷ quota × 30 min plus 5 s per mailbox.';
T.en.sideTownsShort = 'More towns';
Object.assign(T.en, { areaWhole:'whole municipality, ≈ {km2} km²', areaPart:'district only, ≈ {km2} km²' });
Object.assign(T.en, { bikeOk:'Drive between the places (bike, car or bus)', bikeHint:'E.g. villages 1–3 km apart: the trips between the places are counted as a ride (≈ 15 km/h + 5 min) instead of 30 min by bus; which vehicle does not matter. Distributing is on foot.', bikeLbl:'Driving between places', yes:'yes', byBike:'By bike (Google Maps)', farBike:'Still {d} to the route – ride there by bike?' });
T.en.sideFailed = 'No streets with mailboxes were found inside the border of these places, they are not in the route: {list}. Please remove the place and draw it on the map yourself.';
Object.assign(T.en, { draftQ:'Continue the draft?', draftText:'There is an unsaved order “{name}”. Continue where you stopped?', draftYes:'Continue' });
Object.assign(T.en, { tripsBike:'Bike trips', tripsBus:'Bus / train trips' });
Object.assign(T.en, { travelLbl:'Between the places', travel_bus:'Bus / train (30 min per trip)', travel_bike:'Bike (≈ 15 km/h)', travel_car:'Car (≈ 40 km/h)', travelHint:'This is how the trips between the main town and the other towns are counted (real road length, + 5 min per trip). Distributing is on foot.', byCar:'By car (Google Maps)' });
T.en.mustTooMany = 'The towns set to “all mailboxes” have ≈ {mb} mailboxes together, but there are only {f} flyers. In step 1 tap the name and enter a number of flyers – or enter more flyers.';
Object.assign(T.en, { sideOwnKm:'with travel · {km} km', splitHint:'The flyers are shared out evenly over the places (where there are fewer mailboxes, the others get more): {list}' });
Object.assign(T.en, { tabSettings:'Settings' });
Object.assign(T.en, { takenT:'Shift on another phone', takenQ:'Your shift continues on another phone. It was ended here, nothing is counted twice.', otherPhoneT:'Shift already running', otherPhoneQ:'A shift with your account has been running on another phone since {t}. Start here? It will end there.', otherPhoneYes:'Start here', autoPaused:'Paused automatically: no movement since {t}. Tap "Continue" when you go on.' });
Object.assign(T.en, { progLbl:'Progress' });
Object.assign(T.en, { invSection:'Invite workers & login links' });
Object.assign(T.en, { waLogin:'Sign in with WhatsApp', waConfirm:'Confirm number via WhatsApp', waTitle:'Confirm via WhatsApp', waHint:'Tap "Open WhatsApp" and send the prepared message. Then it continues here by itself.', waOpen:'Open WhatsApp', waWait:'Waiting for your message …', waTimeout:'Time is up. Please try again.', waOff:'WhatsApp confirmation is not set up yet.', waPhoneOk:'Number confirmed: {p}', e_wa_expired:'Code expired. Please try again.' });
Object.assign(T.en, { prevWorker:'Before: {n} · {km} · {h} h' });
Object.assign(T.en, { oneDayHint:'All together ≈ {h} h – 1 person can do it in 1 day.', fitsOne:'Fits into 1 day.' });
Object.assign(T.en, { startAnywhere:'May start anywhere (no start point check)' });
Object.assign(T.en, { mergeHint:'{n} has {k} routes in this order.', mergeBtn:'Merge into one route', mergeQ:'The {k} routes of {n} become one route: the days follow each other, done parts and all shifts stay. {n} then picks the days again.' });
Object.assign(T.en, { dayDone:'done', restLine:'Still open: ≈ {km} · {h} h', restNone:'All done' });
Object.assign(T.en, { redayBtn:'Spread the rest over days', redayHint:'The route stays the same, done parts stay done and are skipped. The open work is split evenly over the days; the worker picks the days again.', redayN:'Number of days', openH:'open ≈ {h} h' });
Object.assign(T.en, { stCancelled:'Cancelled', cancelTask:'Cancel order', cancelTaskQ:'Cancel the order? It disappears for the workers, walked parts stay saved. "Reopen" undoes it.' });
Object.assign(T.en, { replanWork:'Re-plan routes (order already running)', replanWorkHint:'What was walked stays saved and counts as done on the new routes. Workers get notified.', replanLive:'Someone is walking this order right now. Re-plan after they finish.', routeChangedTitle:'Route changed: {title}', routeChangedBody:'The order was re-planned. {date}≈ {mb} mailboxes · {km}. Please refresh.', routeChangedDays:'The order was re-planned and now needs more days. Please check the route and pick the days again.' });
