# Veranderingen

Alle wijzigingen uit de "wereldwijde hit"-ronde (analyse → bugfixes → techniek → gameplay → polish), in gewone
taal. Per bug: wat er misging, hoe het is opgelost en hoe dat is gecontroleerd. Nieuwste bovenaan.

## Versie 0.8.0 (november 2026)

Je dorp werkt nu als een echte city builder, met mooiere graphics en een vlotter spel.

- **Wegen die tellen:** een gebouw werkt pas goed als het via een weg aan het stamhuis ligt. Zonder weg werkt
  het op ongeveer een derde, en een opslag krijgt dan niets. Je begint met paden rond het stamhuis, en een kort
  pad naar een nieuw gebouw legt het spel vanzelf aan (2 hout per tegel). Een oranje bordje wijst een los
  gebouw aan. Je kunt een weg aanklikken om hem weg te halen of te vernieuwen. Klinkers geven +10% en asfalt
  +20%. Oude spellen krijgen hun wegen gratis.
- **Bereik van voorzieningen:** waterput, opslag, torens, markt en de nieuwe tempel (bronstijd) hebben een
  bereik. Met 'Toon bereik' zie je welke huizen eronder vallen.
- **Huizen die groeien:** een huis gaat vanzelf van vervallen via eenvoudig, net en welvarend naar prachtig als
  het aan de weg ligt en voorzieningen en sfeer heeft. Elke stap geeft meer inwoners. Gaat de buurt achteruit,
  dan vervalt het huis weer.
- **Zichtbare productieketens:** dragers, karren en later vrachtwagens brengen goederen over de weg naar
  werkplaatsen en bouwplaatsen.
- **Grond en weer:** waar mensen vaak lopen ontstaan paadjes, regen maakt de grond nat met plassen, en de
  donkere rand om bevroren meren is weg.
- **Gevechten:** beschadigde gebouwen roken en branden, verwoeste gebouwen storten in, en treffers en pijlen zijn
  beter te zien (vijandelijke pijlen hebben weer hun eigen kleur). De gloed van kampvuren is rustiger.
- **Performance:** groepen dorpelingen en standbeelden worden in één keer getekend (tot ongeveer de helft minder
  tekenwerk in een grote stad), 's avonds valt er warm licht op de grond, de nabewerking is lichter en de
  schaduwen zijn scherper, ook als je ver uitzoomt.

## Versie 0.7.0 (november 2026)

Vooral mooiere graphics, plus een strakkere HUD en een eerlijker begin.

- **Echte winter en zachte seizoenen:** in de winter ligt er sneeuw op daken, akkers, bomen, rotsen en velden,
  ondiep water en meren vriezen dicht, en wegen en de rand van je land blijven goed te zien. De seizoenen gaan
  's nachts geleidelijk in elkaar over; in de lente bloeien bomen roze, in de herfst ligt er gevallen blad.
- **Zon en maan:** de zon draait mee met de klok, met gouden avonden en blauwe nachten met maanlicht. Bij regen
  is het licht zacht en bewolkt.
- **De stad 's avonds:** ramen gaan huis voor huis aan en na middernacht weer per raam uit; lantaarns gaan één
  voor één aan. Elk huis heeft een eigen tint voor dak en muur.
- **Rook, vuur en weer:** zachte, belichte rook (alleen uit echte schoorstenen van werkende gebouwen), levende
  kampvuren met vonken, en regen en sneeuw die je echt ziet vallen.
- **Natuur en water:** de wildernis ziet eruit als stille natuur, het water heeft een dun schuimlijntje langs de
  oever en lichtspel in ondiep water, regen maakt kringen, en er vliegen echte vogels.
- **Bouwplaatsen:** steigers en bouwmateriaal in de stijl van het tijdperk (en veel lichter voor de computer).
- **Camera en titelscherm:** bij inzoomen kantelt de camera naar de horizon, met nevel in de verte. Het
  titelscherm toont je dorp in een langzaam draaiend shot; 'Verder spelen' glijdt terug naar waar je was.
- **HUD:** geen papierresten meer, de bouwkaart toont twee volle rijen, de minikaart is vierkant en klopt, en
  getallen staan er op zijn Nederlands.
- **Eerlijk begin:** de coach stuurt je niet meer vast, uitbreiden kost nooit staal, en een kampioen valt pas aan
  na een rustige nacht, met een waarschuwing vooraf.
- **Niet meer bouwen op een weg:** een weg is net als een akker een eigen stuk van je dorp; alleen een poort mag
  erop.
- **Kleine reparatie:** een onschuldige browsermelding (ResizeObserver) geeft geen foutmelding in het spel meer.

## Versie 0.6.0 (november 2026)

- **Strak ontwerp:** de hele interface in één ontwerpsysteem, passend bij het nieuwe hoofdmenu. Donkere, licht
  doorschijnende panelen met dunne randen en weinig afronding; geen harde schaduwen, plakband, golflijnen of
  papierkorrel meer. Eén strakke letter met even brede cijfers (de sierletter alleen voor logo en titels), geen
  schuine tekst, kleine kopjes in hoofdletters. De onderbalk is lager, en op een breed scherm zie je tussen de
  selectie en het bouwpaneel gewoon de wereld. De kleur van het tijdperk blijft het enige accent.

## Versie 0.5.0 (november 2026)

- **Nieuw hoofdmenu in game-stijl:** de wereld over het hele scherm, links een groot logo en één lijst met keuzes
  (aanwijzen geeft een gloeiend streepje en de toelichting; pijltjes en Enter werken). Snel spel, Nieuwe wereld,
  Uitdagingen en Wereld van de dag staan samen onder **Nieuw spel**. Het pauzemenu heeft dezelfde stijl.
- **Geen clipping meer bij water:** oevers lagen even hoog als het water of erboven, waardoor smalle en schuine
  rivieren in blokjes verdwenen en de rand flikkerde. Rivieren lopen nu door, met glooiende oevers.
- **Minder haperen:** minder pixels per kwaliteitsstand (grote schermen worden verscherpt opgeschaald), de
  automatische kwaliteit reageert sneller, en achter een geopend venster wordt de wereld maar 30 keer per seconde
  getekend.

## Versie 0.4.0 (november 2026)

Meer basisbouw, meer spelgevoel, schermen van telefoon tot 5K2K, en voor het eerst samen spelen.

- **Sfeer (nieuw tabblad, toets G):** tien soorten versiering, één of meer per tijdperk (bloemperk, totempaal,
  waterput, standbeeld, fontein, tulpenveld, muziektent, stadspark, holofontein, sterrentuin). Versiering maakt
  huizen in de buurt gezelliger; fabrieken, groeves en centrales maken ze somber. Een huis is Somber (−10%
  inwoners), Gewoon, Gezellig (+10%) of Prachtig (+20%), altijd minstens één inwoner verschil. Waterput, windmolen
  en tulpenveld laten akkers in de buurt sneller oogsten (samen hoogstens +40%). Bij het plaatsen zie je het
  bereik en welke huizen of akkers het merken; het paneel Dorp toont een balk met hoe gezellig je huizen zijn.
- **Spelgevoel:** geleverde grondstoffen vliegen als icoontje naar hun teller, die even aantikt. Is versiering klaar,
  dan zie je "+2 sfeer" boven de huizen die het merken.
- **Samen spelen (alleen in de Claude-artifact):** een ranglijst van de wereld van de dag (je score komt er vanzelf
  op) en de dorpen van anderen als plattegrond, met een knop om je eigen dorp te delen. Namen worden nooit
  bewaard, alleen een id; wat anderen delen wordt gecontroleerd voordat het in beeld komt. Wie alleen mag kijken,
  ziet alles maar kan niet delen. Buiten de artifact (GitHub Pages) staat de knop er niet.
- **Geen browserzoom:** knijpen, Ctrl+scrollen en Ctrl +/−/0 zoomen nooit meer de pagina, wel de camera.
- **Schermen:** op een liggende telefoon staat het bouwpaneel rechts, zodat je de wereld ziet. Gecontroleerd op
  iPhone (staand en liggend), een kleine Android, iPad Mini, 3440×1440 en 5120×2160 (op 100% en 150%).

## Versie 0.3.0 (november 2026)

Het spel staat nu in deze repository (eerder `Tijdperk`), met de hele geschiedenis erbij. Deze ronde: een
controle op bugs, en wat kleine technische verbeteringen.

- **Alles verbeteren gaf geld uit aan verouderde gebouwen:** de knop (en Verbeteren per soort) verbeterde ook
  hutten en andere oude gebouwen die niet in de lijst stonden. Bij vernieuwen gaat hun niveau terug naar 1, dus dat
  geld was weg, en het ging af van wat je voor de getoonde gebouwen nodig had. Nu telt dezelfde lijst als je ziet.
  _Gecontroleerd:_ in de browser een hut uit de steentijd in de Middeleeuwen: wel te vernieuwen, niet meer te
  verbeteren.
- **Vijanden waren na laden zwakker of sterker:** kampbewakers kwamen terug met de schade van een gewoon kamp (een
  kamp van niveau 5 sloeg daarna 24% zachter), en soldaten van een rivaal kregen de wapens van het tijdperk van nu.
  De schade wordt nu bewaard. Een bewaker die net gesneuveld was, wordt niet meer bewaard (hij kon twee keer sterven
  en twee keer buit geven). _Gecontroleerd:_ opslaan en laden in de browser, schade voor en na gelijk.
- **Een eis ontlopen door te laden:** een openstaand bericht van een rivaal (of de handelaar) verdween bij laden.
  Het blijft nu staan tot het verloopt; is de rivaal er niet meer, dan vervalt het.
- **Torens en stamhuis toonden verkeerde getallen:** het infopaneel en de verbeterkaart lieten de basisschade en het
  basisbereik zien. Het stamhuis in het Sterrentijdperk liet 6 schade zien, maar deed er 30. Nu rekenen spel,
  infopaneel en verbeterkaart met dezelfde formule.
- **Taal:** "De middeleeuwen breekt aan" wordt "De Middeleeuwen breken aan", "de dronetijdperk" wordt "het
  Dronetijdperk" (melding bij een nieuw tijdperk, het paneel Verbeteren en het eindscherm).
- **Geluid:** voor de eerste klik wordt er geen audio meer aangemaakt (dat gaf een reeks waarschuwingen en
  opgestapelde tonen), en ook een klik in een venster zet het geluid aan.
- **Sneller laden na een update (GitHub Pages):** three.js staat in een eigen bestand, zodat de browser het bewaart
  als alleen de spelcode verandert.

## Daarna

- **Vernieuwen in het paneel Verbeteren:** een verouderd gebouw (hut, wachttoren, kampvuur, ...) staat niet meer
  bij Verbeteren maar bij Vernieuwen: met één klik wordt het op dezelfde plek zijn opvolger van nu (hut → stenen
  huis, wachttoren → kasteeltoren), voor 70% van de nieuwprijs, heel en op niveau 1. Ook **Wegen vernieuwen** (alle
  oude wegtegels in één keer naar klinkers of asfalt) en **Alles herstellen** staan daar nu.

- **Wegen worden echt gebruikt:** de padvinding rekent een stap over een weg goedkoper (pad ×0,75, klinkers
  ×0,68, asfalt ×0,63), zodat dorpelingen en soldaten vanzelf de weg kiezen als die (ook met een kleine omweg)
  sneller is. Eerder liepen ze rechtdoor en kwamen ze alleen toevallig op een weg.

- **Paden door bos:** een weg mag nu over bomen, struiken, losse stenen en zand; wat in de weg staat gaat weg
  (een boom levert 5 hout op, een struik 2 voedsel). Ertsaders blijven in de weg staan.

- **Paden (en muren) weghalen:** een knop **Afbreken** in de bouwbalk (eerder alleen de toets Delete, dus op een
  telefoon onmogelijk). In sloopmodus haalt een klik een gebouw, pad of muur weg, en een sleep een hele strook
  paden en muren (gebouwen niet, zodat je er niet per ongeluk een meesleept).

- **Opgeraakte delfstoffen:** nieuwe gebouwen Steengroeve (steen, steentijd) en Mijnschacht (koper, tin en
  ijzer, IJzertijd) maken langzaam grondstoffen uit het niets; de markt verhandelt nu ook tin, zand en lithium;
  de coach wijst deze uitwegen aan als een grondstof op is en er geen land meer te koop is.
- **Beter ontwerp van figuren en akkers:** rondere hoofden, schouders, hals, kraag en neus; dorpelingen met een
  tasje, geharnaste soldaten met schouderstukken; paarden met hoeven, oren, ogen en zadel; akkers met voren,
  losse planten met aar, een hek rondom, waterbak en vogelverschrikker (van ver nog steeds simpele rijen).
- **Verbeteren:** knop Alles verbeteren altijd zichtbaar, met de totale kosten en het tekort.

## Ronde "Hit-niveau" (oktober 2026)

### Kritiek

- **Laden kon het lopende spel vernielen.** Een kapotte of nieuwere opslag werd pas halverwege het laden
  afgekeurd; het spel, de kaart en de gebouwenlijst waren dan al vervangen, en een minuut later schreef het
  automatisch opslaan die halve stand weg. _Fix:_ `deserialize` controleert nu eerst alles (versie, kaartgrootte,
  lijsten, base64, sleutels van gebouwen, eenheden en onderzoek) en raakt het spel pas daarna aan; gaat het toch
  mis, dan zet `loadSlot` het spel van daarvoor terug. Een opslag die niet te laden is, krijgt een eigen sleutel
  (`…-kapot`) en de volgende plek wordt geprobeerd. _Controle:_ browsertest met afgekapte JSON, kapotte base64 en
  onbekende sleutels (`save_test.py`): het lopende spel blijft staan, onbekende dingen worden overgeslagen.
- **"Snel spel" overschreef zonder waarschuwing je enige bewaarde spel.** _Fix:_ Snel spel, Nog een keer en
  Opnieuw zetten het spel van nu eerst op een vrije eigen plek (`parkLiveGame`); zijn alle plekken vol, dan
  vraagt Snel spel om een tweede klik. _Controle:_ handmatig in de browser; melding "staat bewaard op Plek N".

### Hoog

- **Eén fout bevroor het spel voorgoed.** `requestAnimationFrame` stond aan het eind van de lus zonder
  try/catch. _Fix:_ het volgende beeldje wordt eerst aangevraagd, de rest staat in try/catch; fouten gaan naar de
  console met één melding aan de speler, bij 30 fouten in 5 s gaat het spel op pauze (`core/errors.ts`). Ook
  `error`- en `unhandledrejection`-gebeurtenissen worden gevangen. _Controle:_ test gooit een fout; beeldjes en
  speltijd lopen door, `store.errors` telt.
- **Twee tabbladen overschreven elkaars opslag.** _Fix:_ elk tabblad heeft een nummer; wie het laatst opslaat is de
  baas, het andere tabblad stopt met automatisch opslaan en zegt dat (`storage`-event).
- **Tikken om te bouwen gebruikte een oude vingerpositie** (telefoon) en na schuiven met WASD stond de spookafbeelding
  niet onder de muis. _Fix:_ `trackPointer` bij indrukken, bewegen én loslaten; `refreshMouseTile` elk beeldje als
  de camera beweegt.
- **"Zeker? Klik nogmaals" was met een dubbelklik te omzeilen** (profiel wissen, oorlog verklaren, afbreken, nieuw
  spel). _Fix:_ één gedeelde beveiliging (`ui/confirm.ts`): de tweede klik telt pas na 0,4 s en hooguit 5 s.
- **Geluid startte mogelijk nooit op iOS.** Eén `pointerdown`-luisteraar met `once`; op iOS telt pas het loslaten.
  _Fix:_ blijvende luisteraars op pointerdown/pointerup/touchend/keydown tot de context echt loopt; ook de
  iOS-stand `interrupted` wordt hervat.
- **Centrales gingen om de beurt samen aan en uit.** Alle centrales beslisten met dezelfde oude voorraad stroom.
  _Fix:_ `adjustPowerSup` werkt de voorraad meteen bij; na het laden begint elke centrale op een ander punt van zijn
  stooktijd.
- **Gekapte bomen groeiden na laden nooit terug; een aanval verdween bij opslaan/laden en telde dan als
  "doorstaan"; meteoriet en training gingen verloren.** _Fix:_ `regrow`, `spawnQ`, `meteor`, `starMeteor`,
  `training`, `trainT` en lopende aanvallers (`raiders`) worden opgeslagen en gecontroleerd geladen.
- **Kampbewakers zonder doel zochten elke tik** (`isDead(null)` is waar). _Fix:_ alleen opnieuw zoeken als er een doel
  was dat wegviel of na de wachttijd.
- **Elke gekapte boom bouwde alle bomen en al het gras in beeld opnieuw** (hapering om de paar seconden). _Fix:_
  `hideNode` verbergt alleen die ene instantie; alleen de minikaart en schaduwkaart daar worden bijgewerkt.
- **'s Ochtends werden alle dorpelingen in één beeldje opnieuw gebouwd.** _Fix:_ een dorpeling die binnen is blijft
  bestaan en wordt alleen onzichtbaar.
- **Omlijning viel weg bij de wissel tussen bewegend figuur en vast beeldje.** _Fix:_ schillen hangen aan alle
  onderdelen (ook onzichtbare); het grove gebouwmodel wordt overgeslagen en is ook niet aanwijsbaar.
- **Lampen in/uit de scène dwongen nieuwe shaders af bij de eerste schemering.** _Fix:_ de nachtshaders worden bij
  het eerste beeldje vooraf gecompileerd; marge rond de "ver"-grens zodat de lampen niet heen en weer gaan.
- **Automatische kwaliteit sprong heen en weer** (hoog → middel → hoog om de 10 s). _Fix:_ de stand die te zwaar
  was wordt 90 s gemeden; één traag beeldje na een tabwissel telt niet mee.

### Laag

- Weggestuurde dorpelingen en soldaten bleven "spook"-doelwit (dubbel geteld bij verlies) → `dead = true`.
- Spatschade van aanvallers raakte helpers van een bondgenoot nooit → het doel wordt altijd geraakt.
- Het treffer-effect op gebouwen en dorpelingen werkte maar één keer (`flash` liep niet af) → loopt nu af.
- "Aanval over X uur" rekende fout tussen 0 en 6 uur → opnieuw geschreven vanaf het begin van de dag (6 uur).
- Handelaar liet je betalen zonder te controleren of je genoeg had; een eis die je niet kon betalen sloot stil af →
  `has()`-controle, een onbetaalbare eis telt als weigering.
- `destroyBuilding` haalde het gebouw uit `bById` vóór `unhide`, dus wie erin schuilde bleef op de tegel staan →
  volgorde omgedraaid.
- Snelle dagen (spelregel) werkten niet door in rivaalaanvallen, geschenken en meteorieten → `dayLength()`.
- Zonder dorpelingen en zonder eten zat het spel vast → na 30 s sluit een zwerver zich aan.
- Aanvallers in de wachtrij verschenen ook na het aanzetten van de vredige modus → wachtrij leeg.
- UI-toestand (plaatsmodus, bevelen, pings, tempo's, grote kaart) bleef staan bij een nieuw spel → `resetUiState`.
- Het eindscherm van een vorig spel kon in een nieuw spel verschijnen → timer controleert of het nog hetzelfde spel is.
- Het tempo (2×, 4×) ging verloren na het menu → `lastSpeed`.
- Instellingen/uitleg gingen na een verloren spel niet dicht met Esc → alleen het eindscherm zelf is vergrendeld.
- Opslagkaartjes zetten tekst uit localStorage onge-escaped in HTML → alleen gewone tekst, hooguit 60 tekens.
- Als de lijst met kaartjes niet paste, bleef de opslag wel staan met een oud kaartje → beide of geen van beide.
- Na verlies bleef de automatische opslag staan (verder spelen van vlak vóór de nederlaag) → meteen gewist.
- Slepen bleef hangen na alt-tab; een vergeten vinger maakte van elke tik een knijpgebaar; Shift liet een toets
  "ingedrukt" achter; sneltoetsen gingen af in textarea/select → allemaal opgelost in `input/input.ts`.
- Geluid hervatte op een verborgen tabblad met "stil op de achtergrond" aan → niet meer.
- Kanonskogels stootten per beeldje rook uit (144 Hz = 2,4× zoveel, ook tijdens pauze) → op tijd gebaseerd.
- Tempo- en draaiberekening van figuren gingen uit van 60 Hz → op de echte beeldtijd gebaseerd.
- Instance-buffers van bomen werden niet vrijgegeven; elk figuur had een eigen cirkelmateriaal → `dispose()` en
  één gedeeld materiaal.
- `resize` + ResizeObserver gaven twee keer nieuwe render targets; een andere pixeldichtheid werd niet opgemerkt →
  één resize per verandering, `matchMedia` voor de pixeldichtheid.
- Opslaan ook bij `pagehide` (iOS sluit soms zonder `visibilitychange`).

### Techniek

- Dode code weg (`pulseRes`, `store.lastGroup`, ongebruikte parameter); `weightedPick` één keer in `util/random`.
- De weergave schrijft niets meer in de spelstand (treffer-flits van rivaalgebouwen loopt af in de logica).
- Geen `querySelector` of nieuwe `Set` per beeldje in de spellus.

### Gameplay en gevoel

- Hit-stop en een schok bij een verslagen kampioen en een veroverd kamp.
- Balans: torens tellen met hun echte (verbeterde) sterkte mee voor de grootte van aanvallen; het stamhuis wordt
  per tijdperk minder hard sterker (schade ×0,5 i.p.v. ×0,8 per tijdperk); de buit van het eerste kamp is lager
  (160/130/100) en groeit per kamp-niveau harder (×0,8 i.p.v. ×0,6).

### Polish

- Achtergrondmuziek, ter plekke gemaakt (geen bestanden): overdag licht, 's nachts rustig, donkerder bij een
  aanval. Eigen schakelaar en volume.
- Instellingen **Lichtflitsen** en **Kleurenblindvriendelijk** (vijanden oranje).
- **Deel je score** op het eindscherm (deelmenu of klembord, met zaadcode); omschrijving en sociale voorvertoning
  in de pagina.
- Gevonden onderweg: de knop "Nieuwe wereld" op het eindscherm werkte niet meer sinds de dubbelklik-beveiliging.

## Eerder in deze reeks

- Schuine paden sluiten op elkaar aan (één doorlopende strook in plaats van een dambord).
- Veel meer detail op gebouwen (metselwerk en korrel in de shader, plinten, luiken, kozijnen, nokbalken,
  stoepstenen, spullen op het erf), figuren (ogen, laarzen, riem, handen) en bomen (wortels, takken, bessen), met
  een grove versie van elk gebouw voor ver uitgezoomd.
- Lichtere renderer: omlijning zonder extra beeldpassen, gloed op een kwart van de pixels, niets tekenen achter de
  mist, lampen alleen 's nachts, schaduwkaart zonder flikkeren.
- Snel spel (±25 minuten), oefennacht, "Nog een keer", opslaan bij elke ochtend.
- Torens met geschut draaien mee naar de vijand.
- Rustige, icoon-gebaseerde telefoon-interface.
