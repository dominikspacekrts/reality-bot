# Reality bot – byty bez realitky v Praze

Hlídá pronájmy v Praze (2+kk a větší, do 25 000 Kč se vším, hezké lokality, jen od majitelů)
na **Sreality**, **Bezrealitky** a **UlovDomov**. Každý kandidát se při každé kontrole otevře
přímo u zdroje a ověří se, že je aktivní, není rezervovaný a nejde o realitku, pokoj, suterén
nebo nebytový prostor. Výsledky seřadí podle shody s přáním: lokalita, starší dům s vysokými
stropy, parkování a cena.

- UI: http://localhost:4747 (běží na pozadí)
- Kontrola: 3× denně v časech z `config.json → schedule`
- Ruční kontrola: tlačítko v UI, nebo `npm run check`

## Nastavení – `config.json`

| klíč | význam |
|---|---|
| `search.maxTotalPrice` | limit ceny se vším (nájem + poplatky + odhad energií) |
| `search.estimatedFeesWhenUnknown` | odhad poplatků, když nejsou uvedené |
| `search.energyEstimate` | přičte se, když si energie platí nájemník zvlášť |
| `search.minLocalityScore` | minimální skóre lokality 0–10 (viz `src/localities.js`) |
| `search.allowCompanyLandlords` | pustit i firmy a správce, kteří nejsou realitka |
| `schedule` | časy kontrol; po změně spusť `scripts/install-schedule.sh` |
| `push` | upozornění na telefon přes ntfy: v aplikaci ntfy odebírej kanál `push.topic`; `maxPerRun` = max. počet upozornění z jedné kontroly |
| `email` | odesílání e-mailů (rts-control, zatím vypnuto) |

Dokud není e-mail zapnutý, ukládá se každá zpráva o nových bytech do `outbox/`.

## Správa

```bash
./scripts/install-schedule.sh     # (pře)instaluje plán a UI server
./scripts/uninstall-schedule.sh   # vypne vše
tail -f logs/check.log            # průběh kontrol
```
