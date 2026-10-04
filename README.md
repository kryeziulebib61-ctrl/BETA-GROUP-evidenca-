# BETA GROUP – Evidenca delovnih ur

Spletna aplikacija za iPhone/Android/računalnik, narejena za BETA GROUP.

## Kaj vsebuje

- Administrator in delavci
- Dodajanje delavcev iz administratorskega dela
- Prihod na delo z enim dotikom
- Odhod z dela z enim dotikom
- Samodejni izračun opravljenih ur
- Mesečni pregled in pregled preteklih mesecev
- Shranjevanje GPS lokacije ob prihodu
- Shranjevanje GPS lokacije ob odhodu
- Administrator lahko odpre lokacijo na zemljevidu
- RLS zaščita v Supabase
- Responsive izgled za telefon
- Slovenščina

## 1. Ustvari Supabase projekt

V Supabase ustvari nov projekt.

Nato odpri **SQL Editor** in zaženi celoten:
`supabase/schema.sql`

## 2. Ustvari prvega administratorja

V Supabase:
Authentication → Users → Add user

Ustvari svoj e-mail in geslo.

Kopiraj UUID uporabnika in v SQL Editorju zaženi:

`update public.profiles set role='admin' where id='TVOJ-UUID';`

Če profil še ne obstaja, uporabi INSERT iz komentarja v schema.sql.

## 3. Nastavi config.js

Odpri:
`config.js`

Vpiši:
- Supabase Project URL
- Supabase anon/public key

Anon key je namenjen odjemalcu. **Nikoli ne vstavljaj service_role ključa v index.html ali app.js.**

## 4. Dodajanje delavcev

Aplikacija uporablja varno Supabase Edge Function.

Namesti Supabase CLI in se prijavi, nato iz mape projekta:

`supabase functions deploy create-worker`

Edge Function uporablja `SUPABASE_SERVICE_ROLE_KEY` na strežniški strani. Ta ključ ni v aplikaciji.

Če Supabase CLI zahteva povezavo projekta, uporabi Project ID svojega Supabase projekta.

## 5. Objavi na GitHub Pages

V GitHub repozitorij naloži:
- index.html
- style.css
- app.js
- config.js

Mapo `supabase` lahko hraniš v istem repozitoriju zaradi kode funkcije/SQL.

GitHub:
Settings → Pages → Deploy from branch → main → /root

Nato odpri svoj GitHub Pages naslov.

## 6. Uporaba na iPhone

Odpri stran v Safari → Share → Add to Home Screen.

Pri prvem prihodu/odhodu mora uporabnik dovoliti Location.

## Pomembno glede lokacije

Aplikacija shranjuje zemljepisno širino in dolžino ob kliku na PRIHOD in ODHOD. Administrator lahko za vsak zapis klikne »Odpri lokacijo prihoda« ali »Odpri lokacijo odhoda«.

Za natančnost GPS je pomembno, da uporabnik dovoli lokacijo brskalniku.

## Priporočena naslednja nadgradnja

Za produkcijsko uporabo lahko dodaš:
- urejanje/brisanje zapisov samo za administratorja
- izvoz Excel/PDF
- mesečno poročilo po delavcu
- praznike, dopust in bolniško
- nočno delo
- opozorilo, če delavec pozabi odhod
- podpis delavca
- PWA/offline način
- fotografijo ob prihodu (če jo poslovno potrebuješ)
