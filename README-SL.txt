BETA GROUP – Evidenca delovnih ur

Vse datoteke naložite v korensko mapo GitHub repozitorija in izberite Replace/Commit changes, če datoteke že obstajajo.

Konfiguracija Supabase je v config.js. V brskalniku uporabljajte samo Project URL in javni Publishable key. Nikoli ne dodajajte service_role ali secret key.

Dodajanje delavca:
1. V Supabase odprite Authentication → Users → Add user in ustvarite uporabniški račun delavca.
2. Kopirajte njegov User UID.
3. V aplikaciji kot administrator izpolnite obrazec Dodaj delavca z imenom in UID-jem.
4. Če Supabase zavrne shranjevanje, je treba preveriti RLS INSERT politiko za tabelo public.workers. Ne izklapljajte RLS.

Pomembno: obrazec ustvari profil v tabeli workers, ne pa prijavnega računa. Račun se ustvari v Supabase Auth.

Pred dejansko uporabo preizkusite prijavo delavca, prihod/odhod, GPS, administratorski pregled, RLS in izvoz. Ta paket ni bil preizkušen proti vaši živi zbirki podatkov.
