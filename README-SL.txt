BETA GROUP – Evidenca delovnih ur (začetna različica)

POMEMBNO: To je začetna spletna aplikacija, še ni objavljena in ni v celoti preverjena za produkcijsko uporabo. Pred uporabo z dejanskimi delavci preverite pravila RLS, uporabniške račune, varnost in zakonitost GPS evidence.

1. V datoteki config.js zamenjajte PASTE_PROJECT_URL_HERE in PASTE_SB_PUBLISHABLE_KEY_HERE z javnim Project URL in Publishable key iz Supabase.
2. Nikoli ne vstavite service_role ali secret key v datoteko, ki je objavljena na internetu.
3. Naložite vse datoteke na statično gostovanje s HTTPS (npr. GitHub Pages). Odprite objavljeni naslov v Safari/Chrome.
4. iPhone: Share / Deli > Add to Home Screen / Dodaj na začetni zaslon. Android: meni brskalnika > Add to Home screen / Install app.
5. Vsak delavec in administrator potrebujeta ločen Supabase Auth račun. Vsak račun mora imeti profil v public.workers z istim UUID kot auth.users.id. full_name = ime, is_admin = true samo za administratorja, active = true za aktivne uporabnike.
6. Uporabniške račune ustvarite prek Supabase Authentication > Users; ne delite administratorjeve prijave z delavci.

FUNKCIONALNOSTI: prijava, prihod/odhod s GPS ob pritisku, lastni zapisi delavca, pregled administratorja in CSV izvoz.
OMEJITJE: dodajanje uporabnikov iz aplikacije nuk është i përfshirë; krijimi i llogarive bëhet në Supabase. Aplikacioni nuk llogarit ende automatikisht totalet ditore dhe nuk parandalon regjistrimet e dyfishta. Kontrolloni sigurinë përpara përdorimit real.
