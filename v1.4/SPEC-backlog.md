# Hollowtree — spec: co budujemy dalej

Wybrane przez Jurka 2026-08-08 z listy 30 propozycji. Kolejność w pliku = kolejność z listy,
nie priorytet. Koszt: `S` godziny, `M` dzień, `L` więcej.

## Ramy, w których to działa (ustalone 2026-08-08)

- **Jedna sesja, jeden ul.** Ul nie trwa między sesjami. Wszystko, co poniżej, musi dawać
  satysfakcję w obrębie jednego posiedzenia — żadnych mechanik nastawionych na tygodnie.
  *Konsekwencja:* raport offline (25 %, maks 8 h) traci sens jako filar progresji; zostaje
  najwyżej jako wygoda przy powrocie do trwającej sesji.
- **Komputer / laptop.** Klawiatura i mysz. Sterowanie może wymagać precyzji i skrótów.
  Telefon nie jest celem — nie projektujemy pod dotyk.
- **Trzech graczy** (Jurek, tata, Ryszard). `NET.maxPlayers` już wynosi 3 i zestaw testów
  sieciowych obejmuje trzy królowe. Role i cele muszą działać też przy 2 osobach.
- **Low-poly zostaje.** Dopieszczamy światło, kolor, materiały i sylwetki. Bez zmiany stylu.
- **Serce gry:** budowanie ula, granie razem, klimat. Latanie jest środkiem, nie celem.
- **Można umrzeć, ale nie przegrać.** Królowa ginie i odradza się; ul nie ginie nigdy i nie ma
  ekranu porażki. Śmierć jest osobistą stratą (niesiony ładunek, czas), nie cofnięciem sesji.
  *Konsekwencja:* szerszeń jest zagrożeniem dla królowej i dla zapasów, nie dla budowli.

---

## 1. Komórka wyrasta zamiast się pojawiać  `S`

**Co:** postawiona komórka rośnie z animacją (skala od `COMB_TUNING.growFrom`) i dostaje
dźwięk oraz mikro-shake kamery na ukończenie.

**Dlaczego:** dziś komórka po prostu jest. Nie ma momentu nagrody za jedyną czynność, wokół
której zbudowana jest cała gra.

**Gdzie:** `src/nest/comb.js` (`update()` już tika postęp budowy na `buildTickHz`), `sfx-build`
jest w manifeście audio i nieużywany, `post.setMotionState` przyjmuje shake.

**Kryterium odbioru:** od kliknięcia do gotowej komórki widać ciągły wzrost; dźwięk odpala się
raz, na ukończeniu, nie na postawieniu; przy stawianiu 10 komórek naraz nie ma kakofonii.

## 2. Widoczny brak surowców  `S`

**Co:** na liście typów w panelu budowania pokazać **ile brakuje**, nie samo „za drogo".
Np. `honey store — brakuje 3 żywicy`.

**Dlaczego:** gracz widzi czerwoną cyfrę i nie wie, czy brakuje mu 1 czy 30, ani czego.

**Gdzie:** `src/ui/build-panel.js` (ma już `KIND_COLOR`/`KIND_LABEL` i `costPhrase`),
`comb.canPlace()` zwraca `cost` i `affordable`.

**Kryterium odbioru:** dla każdego typu, na który cię nie stać, panel podaje brakującą
ilość każdego surowca z osobna. Liczby zgadzają się z bankiem.

## 3. Rozbiórka z podglądem  `S`

**Co:** zanim rozbierzesz komórkę, widzisz co tracisz (pojemność, przerób, bonusy sąsiadów)
i ile żywicy wróci (`COMB_TUNING.refundFraction` = 0.5).

**Dlaczego:** rozbiórka jest dziś nieodwracalna i niema. Nikt jej nie użyje, bo nie wie, co zrobi.

**Gdzie:** `src/nest/build-mode.js` (`tearDown()`, `state.hover` już trzyma najechaną komórkę),
`comb.refundOf()` istnieje.

**Kryterium odbioru:** najechanie na własną komórkę w trybie budowania pokazuje zwrot i utratę
przed kliknięciem; komórki `permanent` (zasiew START) jasno komunikują, że nie da się ich ruszyć.

## 4. Ping — znacznik dla drugiego gracza  `M`

**Co:** klawisz stawiający w świecie znacznik widoczny dla wszystkich w ulu, gasnący po chwili.

**Dlaczego:** tata i Ryszard nie mają mikrofonu w grze. Bez tego nie da się powiedzieć
„tutaj" — a to jest podstawowa czynność w co-opie.

**Gdzie:** nowy kanał w `src/net/` obok `bank`/`comb`/`world`; render jako sprite podobny do
`comb_start_label`. Uwaga na koszt pasma — dziś 1.57 KB/s na klienta przy trzech graczach.

**Kryterium odbioru:** ping postawiony przez jednego gracza jest widoczny u pozostałych w
mniej niż sekundę, ma kierunek gdy jest poza kadrem, i nie da się nim zaspamować ekranu.

## 5. Larwy, które wylatują  `L`

**Co:** `brood cell` realnie produkuje robotnice. Larwa rośnie w komórce, po czasie wylatuje
i dołącza do roju latającego po ulu i po łące.

**Dlaczego:** to moment, w którym ul przestaje być tabelką i zaczyna być żywy. Najmocniejszy
pojedynczy pomysł z całej listy.

**Gdzie:** `src/entities/swarm.js` (istnieje, instancjonowany, `swarmCap` liczy się z komórek),
`src/nest/comb.js` efekty `swarmCap`, `COMB_TUNING.staffing.builder` jest dziś na 0 i czeka
dokładnie na to.

**Kryterium odbioru:** brood cell po ukończeniu wypuszcza robotnicę w mierzalnym czasie;
liczba żywych robotnic nie przekracza `swarmCap`; rój nadal idzie po sieci jako skład
(`{worker: n, builder: n}`), nigdy per pszczoła.

## 6. Snop światła z wlotu wędruje po ścianie  `M`

**Co:** kierunek światła wpadającego przez otwór zmienia się z porą dnia, przesuwając jasną
plamę po wnętrzu.

**Dlaczego:** wnętrze jest dziś statyczne. To najtańszy sposób, żeby ul żył bez dodawania obiektów.

**Gdzie:** `src/nest/interior.js`, `timeOfDayAt(worldNow())` już liczy się w `main.js` i jest
podawane do `sky` i `audio` — wystarczy podać je też do wnętrza. Dzień trwa 45 min
(`SKY.dayLengthMs`), więc ruch musi być wyraźny w skali minut, nie godzin.

**Kryterium odbioru:** przy przewinięciu zegara świata plama światła mierzalnie zmienia
pozycję; nie prześwietla wnętrza w południe ani nie gasi go całkiem o zmierzchu.

## 7. Kurz i pyłki w snopie  `S`

**Co:** drobiny unoszące się w snopie światła, reagujące na przelot gracza.

**Dlaczego:** klimat, jednym systemem cząstek. Intro ma już taki efekt (`motes`) i wygląda dobrze.

**Gdzie:** `src/nest/interior.js`; wzorzec do przepisania jest w `src/cinematic/intro.js` (`motes`).

**Kryterium odbioru:** drobiny widoczne tylko w snopie, nie w całym wnętrzu; przelot królowej
zaburza je w promieniu kilku metrów; koszt klatki poniżej 1 ms.

## 8. Deszcz widoczny z wnętrza  `S`

**Co:** stojąc w ulu widać deszcz przez otwór wlotu, a jego dźwięk jest przytłumiony.

**Dlaczego:** pogoda i audio już istnieją i są niewykorzystane w środku. Darmowy klimat.

**Gdzie:** `src/world/weather.js`, `src/audio/weather.js` (ma już `wx-rain-inside-*`),
`portal.state.insideness` steruje tłumieniem.

**Kryterium odbioru:** przejście wlotem daje ciągłe przejście dźwięku, bez skoku; deszcz
widoczny przez otwór, nie padający w środku ula.

## 9. Modele  `L`

**Co:** trzy rzeczy, w tej kolejności:
1. **robotnica odróżnialna od królowej** — dziś rój to te same modele co gracz,
2. **rzeźbione wnętrze dziupli** — słoje, sęki, faktura drewna zamiast gładkich paneli,
3. **3–4 warianty każdego gatunku kwiatu**, żeby łąka nie była powtarzalna (10 gatunków w
   `FLOWER_SPECIES`, każdy ma dziś jeden model).

**Dlaczego:** to trzy miejsca, w których gra najbardziej wygląda na prototyp.

**Gdzie:** Blender MCP, eksport do `assets/models/`, ładowanie przez `src/core/assets.js`.
Budżety trójkątów i konwencja kotwic jak w istniejących modelach.

**Kryterium odbioru:** każdy model przechodzi bramki z rundy 1 tego pliku (ładuje się bez
błędu, kotwice się rozwiązują, budżet trójkątów, brak z-fightingu) i ocenę świeżego Critica
przeciw profilowi „wydany stylizowany low-poly".

---

## Odłożone z pierwszej trzydziestki (nie odrzucone)

Pierwsze minuty: cel na ekranie zamiast tutoriala; kompas do kwiatu; ścieżka powrotu do ula;
plansza sterowania dla taty; kod ula w URL. Zbieranie: podświetlenie kwiatów w zasięgu;
licznik ładunku przy kursorze. Co-op: wspólny duch budowania; „co robi drugi gracz";
wspólny cel z paskiem; karta końca sesji. Głębia: kształt plastra ma znaczenie; ulepszanie
komórek; plan budowy; ciepło ula; historia ula. Systemy: szerszenie na dwie osoby; cel
sezonowy; własna spiżarnia; raport z nieobecności; ul rozjaśnia się w miarę rozbudowy.

*Uwaga: „ul rozjaśnia się w miarę rozbudowy" częściowo realizuje bieżąca runda Gauntletu
(oświetlenie ściany budowania), więc przy wracaniu do niego sprawdź, co już jest.*

---

## Rozstrzygnięcia projektowe

**Stawka (2026-08-08):** można umrzeć, ale nie przegrać. Nie ma stanu porażki i nie ma utraty ula.
Wszystko, co projektujemy wokół szerszeni, sezonu i celu sesji, ma respektować tę zasadę: może
zabrać królową i zapasy, nie może zabrać dorobku.

**Kod już to zakłada.** `CELL_TYPES` zawiera `queen's chamber` z flagą `queenChamber: true`,
udokumentowaną jako „respawn + upgrade point", i ta flaga nie ma dziś żadnej implementacji —
to jest naturalny punkt zaczepienia dla śmierci i odrodzenia.

---

# Fala 2 — wybrane 2026-08-08 z listy 31–60

Piętnaście pozycji. Numeracja z oryginalnej listy zachowana, żeby dało się wrócić do rozmowy.

## Blok śmierci (31–35) — budować razem, nie osobno

Te pięć to jeden system, nie pięć zadań. Rozbite na kawałki dadzą półśrodki: odrodzenie bez
utraty ładunku jest bez konsekwencji, utrata ładunku bez ostrzeżenia jest niesprawiedliwa,
a szerszeń, który tylko zabija, łamie zasadę „nie da się przegrać". Kolejność wdrożenia:
33 → 31 → 34 → 32 → 35.

### 31. Queen's chamber jako punkt odrodzenia  `M`
**Co:** bez zbudowanej komnaty odradzasz się przy wlocie; z nią — w środku ula, przy niej.
**Dlaczego:** daje komnacie powód istnienia i czyni z odrodzenia decyzję budowlaną.
**Gdzie:** `CELL_TYPES` ma `queen's chamber` z flagą `queenChamber: true`, opisaną w słowniku
efektów jako „respawn + upgrade point" — flaga **nie ma dziś żadnej implementacji**.
`comb.effects.queenChambers` to już Mapa, gotowa do odpytania.
**Odbiór:** śmierć bez komnaty stawia królową przy wlocie; z komnatą — przy niej; przy trzech
graczach każdy odradza się w tej samej komnacie bez przepychania.

### 32. Ładunek zostaje na ziemi  `M`
**Co:** to, co niosłaś, wysypuje się w miejscu śmierci jako do pozbierania — przez ciebie
albo przez kolegę.
**Dlaczego:** zamienia stratę w zadanie i daje drugiemu graczowi coś do zrobienia.
**Gdzie:** `src/systems/gather.js` trzyma ładunek; zrzut jako obiekt świata w `src/world/`,
synchronizowany jak inne wspólne stany (transakcja, nie `set()`).
**Odbiór:** zrzut widoczny u wszystkich; podniesienie przez kogokolwiek usuwa go u wszystkich
dokładnie raz; nie da się go zduplikować dwoma klientami naraz.

### 33. Śmierć nigdy z zaskoczenia  `S`
**Co:** szerszeń narasta dźwiękiem i jest widoczny z dystansu; zabicie zza kadru zabronione.
**Dlaczego:** to warunek, żeby cała reszta bloku była do przyjęcia dla taty i Ryszarda.
**Gdzie:** `src/entities/hornets.js`, `hornet-buzz` / `hornet-drone` już w manifeście audio,
`audio.setHornets()` istnieje.
**Odbiór:** od pierwszego sygnału do możliwego trafienia mija mierzalny czas pozwalający uciec;
sygnał jest słyszalny również, gdy szerszeń jest poza kadrem.

### 34. Chwila słabości zamiast kary  `S`
**Co:** po odrodzeniu kilka sekund wolniejszego lotu. Zero ekranów ładowania i odliczania.
**Dlaczego:** kara czasowa wyrzuca gracza z gry; osłabienie zostawia go w niej.
**Gdzie:** `src/entities/flight.js` (mnożnik prędkości), `post.setMotionState` do sygnału wizualnego.
**Odbiór:** gracz steruje nieprzerwanie od momentu śmierci; osłabienie jest widoczne i mija samo.

### 35. Szerszeń kradnie i odlatuje  `M`
**Co:** szerszeń zabiera miód i ucieka, zamiast burzyć plaster.
**Dlaczego:** jedyny wariant zagrożenia zgodny z „nie da się przegrać" — masz powód, żeby gonić,
i nie tracisz dorobku.
**Gdzie:** `src/entities/hornets.js`, nalot rozstrzyga właściciel świata i stosuje do wspólnego
plastra (ten szlak już istnieje w `main.js`).
**Odbiór:** nalot zmniejsza zapas miodu, nigdy liczbę komórek; przechwycenie szerszenia przed
ucieczką odzyskuje część łupu.

## Budowanie

### 38. Komórka pokazuje, co ma w środku  `S`
**Co:** pełny magazyn miodu świeci mocniej niż pusty; zapełnienie widać po materiale.
**Gdzie:** `src/nest/comb.js`, `emissive` jest już w `COMB_TUNING` jako ułamek koloru komórki;
`stores` i `effects.capacity` dają zapełnienie.
**Odbiór:** różnica pustego i pełnego czytelna z drugiego końca ściany; koszt klatki bez zmian
(aktualizacja instancji na tiku, nie co klatkę).

### 40. Komórka-okno  `S`
**Co:** półprzezroczysta komórka, przez którą widać zawartość — larwę albo miód.
**Uwaga:** **38 i 40 to ta sama potrzeba** („chcę widzieć, co jest w ulu"). Zrobić 38 pierwsze
i dopiero ocenić, czy 40 jeszcze coś dokłada — może się okazać zbędne.

### 39. Tryb lustra  `M`
**Co:** budujesz po jednej stronie, opcjonalnie odbija się symetrycznie na drugą.
**Dlaczego:** ładne plastry bez dłubania; wzmacnia to, co w grze najprzyjemniejsze.
**Gdzie:** `src/nest/build-mode.js` (`commit()`), oś odbicia = środek ściany budowania
(`grid.buildWallCenterS` już istnieje).
**Odbiór:** odbicie kosztuje surowce za obie komórki; wyłączone nie zmienia niczego; przy
trzech graczach nie powoduje wyścigu o to samo pole.

## Co-op

### 42. Kto co postawił  `S`
**Co:** obwódka komórki w kolorze królowej, która ją zbudowała.
**Gdzie:** każda komórka ma już `owner` (uid), a `net.roster()` daje kolor każdej królowej;
`QUEEN_STYLE.colors` to sześć palet.
**Odbiór:** kolory zgadzają się z liberią w rosterze; komórki zasiewu (`owner: 'hive'`) są
neutralne; działa też, gdy autor wyszedł z sesji.

## Sesja i klimat

### 50. Ostatnia minuta  `S`
**Co:** o zmierzchu rój wraca do ula i wszystko cichnie.
**Zależność:** pomysł 49 („sesja to jeden dzień") **nie został wybrany**, więc zmierzch nie
kończy sesji. To zdarzenie ma więc występować przy **każdym** zmierzchu jako rytm dnia, a nie
jako domknięcie rozgrywki. Dzień trwa 45 min (`SKY.dayLengthMs`), więc zdarza się realnie często.
**Uwaga:** mocno zachodzi na 56 — zrobić jako jedną rzecz.

### 52. Ul brzmi inaczej, im większy  `S`
**Gdzie:** `src/audio/context.js` ma pogłos z pętlą zwrotną sterowaną `insideness`; wystarczy
domieszać `comb.effects.cellCount`.
**Odbiór:** różnica słyszalna między ulem 7- i 40-komórkowym; brak trzasków przy zmianie.

### 53. Pora roku widoczna na łące  `S`
**Gdzie:** `POST.grade` ma już `uSeasonTint` i `uSeasonMix` — **nieużywane**. `seasonAt()`
liczy się co klatkę w `main.js`.
**Odbiór:** cztery pory dają cztery rozróżnialne palety; przejście jest płynne, nie skokowe.

### 54. Wiatr, który widać  `S`
**Gdzie:** shader trawy ma już `uWindDir` i `setWind()`; system pogody zna kierunek.
**Odbiór:** kierunek gięcia trawy zgadza się z kierunkiem dźwięku wiatru; podmuch widać jako falę.

### 56. Świt i zmierzch jako wydarzenie  `M`
**Co:** długie cienie, ciepły kolor, ptaki zamiast cykad.
**Gdzie:** `sky` liczy elewację słońca; `amb-birds`, `amb-night`, `amb-cicadas` są w manifeście.
**Odbiór:** świt i zmierzch rozpoznawalne bez patrzenia na zegar; warstwy audio krzyżują się
płynnie. **Łączyć z 50.**

### 58. Szerszeń, który wygląda groźnie  `M`
**Co:** większy, ciemniejszy, sylwetka wyraźnie inna niż pszczoły.
**Dlaczego:** dziś ma dźwięki i nie ma wyrazu — a po bloku 31–35 staje się głównym antagonistą.
**Gdzie:** Blender → `assets/models/`, ładowanie przez `src/core/assets.js`, instancjonowanie
jak rój.
**Odbiór:** rozpoznawalny z 20 m po samej sylwetce; budżet trójkątów jak pozostałe modele;
bramki z rundy 1 tego pliku.

## Nie wybrane z 31–60

36 kolejka budowy, 37 podgląd sąsiedztwa, 41 podparcie plastra, 43 wkład w HUD, 44 ciężki
ładunek na dwie królowe, 45 echo pinga, 46 przekrój plastra, 47 rezerwacja pola, 48 cel sesji,
49 sesja to jeden dzień, 51 karta końcowa, 55 cisza jako efekt, 57 sylwetki komórek, 59 półki
i galerie, 60 paleta per sezon.

*Uwaga: 37, 43 i 60 są policzone w kodzie i nigdzie nie pokazane — gdyby kiedyś zabrakło
taniej roboty o dużym efekcie, zaczynać od nich.*
