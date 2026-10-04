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


DODATNA SPREMEMBA: Administrator vidi tudi razdelek »Moja evidenca« z gumboma »Prihod na delo« in »Odhod z dela« za lastno evidenco. Oba gumba uporabljata prijavljeni administratorski račun.


MESEČNI PREGLED: Delavec (tudi administrator) lahko izbere mesec, vidi dnevni pregled prihodov/odhodov, izračunane ure iz parov prihod-odhod in vse zapise za izbrani mesec. Pretekli meseci so na voljo prek izbirnika meseca.


Ta različica vsebuje prenovljen, odziven uporabniški vmesnik za BETA GROUP, navdihnjen s sodobnimi aplikacijami za evidenco delovnega časa. Ohranja obstoječo Supabase povezavo in obstoječe funkcije. Ne gre za uradni izdelek Poligram.


SAMODEJNI IZRAČUN UR: delovni čas se računa od »Prihod na delo« do »Odhod z dela«. Če je prihod odprt, se trajanje sproti povečuje in se evidenca osveži vsako minuto. Dnevni in mesečni seštevki se izračunajo iz zabeleženih dogodkov.

ADMINISTRATORSKI MESEČNI PREGLED: izberite mesec za izračun ur po delavcih; v evidenci so GPS koordinate in povezava »Odpri zemljevid«. Lokacija je na voljo samo za registracije, pri katerih je bila lokacija dovoljena in shranjena.

DODATNO: Delavec ima svojo dnevno in mesečno evidenco z avtomatskim izračunom ur. Administrator ima mesečni povzetek za ekipo ter izbirnik delavca za podrobno dnevno evidenco. GPS povezave so vidne, kadar so koordinate shranjene ob registraciji.


LOGIN FIX: Prijavni obrazec je viden tudi, če se Supabase knjižnica ali konfiguracija ne naloži. V tem primeru se pokaže jasno sporočilo in prijava je onemogočena, dokler povezava ni popravljena.
