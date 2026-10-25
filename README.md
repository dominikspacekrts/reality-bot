# Reality bot – byty bez realitky v Praze

Hlídá pronájmy v Praze (2+kk a větší, do 25 000 Kč se vším, hezké lokality, jen od majitelů)
na **Sreality**, **Bezrealitky** a **UlovDomov**. Každý kandidát se při každé kontrole otevře
přímo u zdroje a ověří se, že je aktivní, není rezervovaný a nejde o realitku, pokoj, suterén
nebo nebytový prostor. Výsledky seřadí podle shody s přáním: lokalita, starší dům s vysokými
stropy, parkování a cena.

- Web: https://dominikspacekrts.github.io/reality-bot/
- Kontrola: 2× denně (8:00 a 19:00) přes GitHub Actions, nezávisle na Macu
- Nové byty: upozornění na telefon přes aplikaci ntfy
- Ruční kontrola: GitHub → Actions → „Kontrola bytů“ → Run workflow

## Jak to běží v cloudu

`.github/workflows/check.yml` se spouští podle cronu (v UTC, pro letní i zimní čas)
a pustí jen běh, který v Praze vychází na 8 nebo 19 hodin. Stav (známé inzeráty, co už
bylo odesláno) se ukládá do větve `state`, web se nasadí na GitHub Pages. Kanál ntfy je
v tajném údaji repozitáře `NTFY_TOPIC`, ne v kódu. Hvězdičky, skrytí a přepínač
„celá Praha“ se na webu pamatují v prohlížeči každého zařízení.

Lokálně (`npm start`, `npm run check`) to jde spustit taky; tajné údaje se pak čtou
z `.env.local`. Pozor: lokální běh má vlastní stav a pošle upozornění znovu.

## Nastavení – `config.json`

| klíč | význam |
|---|---|
| `search.maxTotalPrice` | limit ceny se vším (nájem + poplatky + odhad energií) |
| `search.estimatedFeesWhenUnknown` | odhad poplatků, když nejsou uvedené |
| `search.energyEstimate` | přičte se, když si energie platí nájemník zvlášť |
| `search.minLocalityScore` | minimální skóre lokality 0–10 (viz `src/localities.js`) |
| `search.allowCompanyLandlords` | pustit i firmy a správce, kteří nejsou realitka |
| `schedule` | časy kontrol (pro cloud uprav i cron a kontrolu hodin v `check.yml`) |
| `push` | upozornění na telefon přes ntfy (kanál je v tajném údaji `NTFY_TOPIC`); `maxPerRun` = max. počet upozornění z jedné kontroly |
| `email` | odesílání e-mailů (rts-control, zatím vypnuto) |

Dokud není e-mail zapnutý, ukládá se každá zpráva o nových bytech do `outbox/`.

## Lokální plán na Macu (volitelné)

```bash
./scripts/install-schedule.sh     # kontroly a UI přes launchd (nepoužívat spolu s cloudem)
./scripts/uninstall-schedule.sh   # vypne vše
```
