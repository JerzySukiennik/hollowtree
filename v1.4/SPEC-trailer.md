# Hollowtree — trailer, spec

Ustalone z Jurkiem 2026-08-08.

## Ramy

| | |
|---|---|
| Długość | 60–75 s |
| Format | 16:9 poziomy, 1920×1080, 60 fps |
| Obraz | kamera kinowa w silniku — skryptowane najazdy i orbity, nie granie ręką |
| Muzyka | patrz „Prawa do muzyki" niżej |
| Zakończenie | **Play now** + `hollowtree.gzowo.fun` |
| Upload | **NIE mam narzędzia do YouTube.** Composio niedostępne — oddaję plik, Jurek wrzuca sam |

## Prawa do muzyki — decyzja i dlaczego

Jurek wybrał „z gry, ale może być inna potem fetchowana". Domyślnie biorę **utwór CC0 z darmowej
biblioteki**, nie `cutscene-music.mp3`, i to jest świadoma decyzja, nie pominięcie: nie wiem, skąd
ten plik pochodzi ani na jakiej licencji. Na prywatnej stronie to nieistotne, ale **YouTube skanuje
ścieżkę dźwiękową i dopasowuje ją do bazy Content ID** — cudza muzyka oznacza roszczenie, blokadę
w niektórych krajach albo przejęcie przychodów, i zdarza się to również przy materiale, który
autor uważał za darmowy.

Jeśli Jurek potwierdzi, skąd `cutscene-music.mp3` pochodzi i że wolno go użyć publicznie —
podmieniam jednym poleceniem, montaż jest od tego niezależny.

## Struktura — 7 bloków, ~70 s

Napisy „friendly", tą samą rodziną krojów co UI gry (ui-rounded / system-ui), nie szeryfowym
tytułem. Jeden napis na blok, wchodzi i schodzi miękko, nigdy nie zasłania akcji.

| # | Czas | Napis | Co widać |
|---|---|---|---|
| 1 | 0:00–0:06 | *Introducing…* | Czerń → pierwsze światło przez koronę drzewa, powolny najazd na dziuplę. Cicho. |
| 2 | 0:06–0:17 | *Explore a meadow that breathes* | Lot nisko nad łąką, kwiaty uginają się pod wiatrem, trawa faluje, drzewa w oddali. Jedno długie ujęcie bez cięcia. |
| 3 | 0:17–0:28 | *Gather what the hive needs* | Zbliżenie na zbieranie: królowa przy kwiacie, pyłek, wskaźnik ładunku. Trzy szybsze ujęcia. |
| 4 | 0:28–0:42 | *Build your hollow, cell by cell* | Wlot, wnętrze, START na ścianie, plaster rosnący komórka po komórce w przyspieszeniu. Serce trailera — najdłuższy blok. |
| 5 | 0:42–0:52 | *Weather the season* | Timelapse: słońce przechodzi po ścianie, deszcz, wiatr, zmierzch. Ten sam materiał, który idzie do przebudowanego intra. |
| 6 | 0:52–1:03 | *Three queens, one hollow* | Trzy królowe w różnych liberiach lecą razem, wspólny plaster rośnie. Wymaga trzech klientów w jednym ulu. |
| 7 | 1:03–1:12 | **HOLLOWTREE** → *Play now* → `hollowtree.gzowo.fun` | Logo na spokojnym ujęciu drzewa o zmierzchu. Muzyka wybrzmiewa. |

## Pipeline

Deterministyczny render offline, nie przechwytywanie ekranu:

1. **Kamera kinowa** — moduł prowadzący prawdziwą kamerę gry po skryptowanej ścieżce
   (najazdy, orbity, spowolnienia). Mieszka w `work/trailer/`, **nie** w `src/cinematic/`, żeby
   nie kolidować z przebudową intra, która trwa równolegle.
2. **Render** — headless Chrome, stały krok czasu (nie realny zegar), klatki PNG na dysk.
   Determinizm jest tu warunkiem koniecznym: bez niego każda iteracja pętli agent-critic
   ocenia inny materiał.
3. **Napisy** — generowane krojem UI gry, nakładane jako warstwa z kanałem alfa.
4. **Montaż** — ffmpeg 8.1.2: sklejka, przejścia, ścieżka, kodowanie H.264 pod YouTube.

## Pętla agent-critic

Builder składa blok → Critic na świeżym kontekście ocenia **z obejrzanego materiału**, nie z opisu
→ poprawki → następna runda. Rubryka: czytelność akcji w kadrze, tempo, zgodność napisu z obrazem,
brak artefaktów (kamera w geometrii, puste kadry), jakość kodowania.

## Ryzyka

- **Blok 6 wymaga trzech klientów naraz** w jednym ulu, a przeglądarkowy harness dławi ukryte
  karty. Jeśli nie da się nagrać trzech królowych jednocześnie, uczciwiej pokazać dwie niż
  udawać trzy.
- **Blok 5 zależy od przyspieszenia pogody i nieba** — ten sam mechanizm buduje teraz Builder C
  do intra. Warto poczekać na jego wynik i użyć tego samego, zamiast pisać drugi raz.
- Gra jest miejscami surowa. Trailer nie może obiecywać rzeczy, których nie ma — każdy kadr musi
  pochodzić z działającej gry.
