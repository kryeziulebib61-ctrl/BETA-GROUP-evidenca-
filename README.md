# BETA GROUP – Evidenca delovnih ur

1. Supabase → SQL Editor → zaženite `schema.sql`.
2. Authentication → Users → ustvarite administratorja.
3. UUID administratorja vstavite v `profiles` z `role='admin'`:

insert into public.profiles(id,role,full_name) values ('UUID-ADMIN','admin','Administrator');

4. Razpakirajte ZIP in naložite vse datoteke v GitHub.
5. Settings → Pages → Deploy from branch → main / root.

Aplikacija je v slovenščini in vsebuje administratorja, delavce, prihod/odhod, samodejni izračun ur, GPS lokacije, zemljevid, mesečne preglede, CSV, Excel in PDF.
