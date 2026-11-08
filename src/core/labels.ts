/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prescribed button labels of Article 11a of Directive 2011/83/EU, as inserted
 * by Article 1(3) of Directive (EU) 2023/2673, in all 24 official EU languages.
 *
 * Every entry was extracted verbatim from the official language version of
 * Directive (EU) 2023/2673 on EUR-Lex (OJ L, 2023/2673, 28.11.2023). The
 * `withdrawSentence` and `confirmSentence` fields hold the full sentence of
 * Article 11a(1) second subparagraph and Article 11a(3) second subparagraph in
 * which the label is quoted, so every label can be checked against the source.
 *
 * Do not edit these strings by hand. Run `node scripts/verify-labels-eurlex.mjs`
 * to re-check them against EUR-Lex.
 *
 * @packageDocumentation
 */

/** ISO 639-1 codes of the 24 official languages of the European Union. */
export type OfficialLanguage =
  | 'bg' | 'es' | 'cs' | 'da' | 'de' | 'et' | 'el' | 'en' | 'fr' | 'ga' | 'hr' | 'it'
  | 'lv' | 'lt' | 'hu' | 'mt' | 'nl' | 'pl' | 'pt' | 'ro' | 'sk' | 'sl' | 'fi' | 'sv';

/** One official language version of the two prescribed labels. */
export interface OfficialLabels {
  /** ISO 639-1 language code. */
  readonly language: OfficialLanguage;
  /** English name of the language. */
  readonly languageName: string;
  /** Label of the withdrawal function, Article 11a(1) second subparagraph. */
  readonly withdrawLabel: string;
  /** Label of the confirmation function, Article 11a(3) second subparagraph. */
  readonly confirmLabel: string;
  /** The full official sentence that quotes `withdrawLabel`. */
  readonly withdrawSentence: string;
  /** The full official sentence that quotes `confirmLabel`. */
  readonly confirmSentence: string;
  /** EUR-Lex URL of the language version the text was taken from. */
  readonly url: string;
  /** Always `"official"`: taken verbatim from the Official Journal text. */
  readonly source: 'official';
}

/** The official labels, in EUR-Lex language order. */
export const OFFICIAL_LABELS: readonly OfficialLabels[] = Object.freeze([
  {
    language: 'bg',
    languageName: 'Bulgarian',
    withdrawLabel: 'откажете се от договора тук',
    confirmLabel: 'потвърждавам отказа',
    withdrawSentence: 'Функцията за отказ се обозначава с думите „откажете се от договора тук“ или със също толкова недвусмислен израз, по лесночетлив начин.',
    confirmSentence: 'Тази функция за потвърждаване се обозначава по лесночетлив начин и само с думите „потвърждавам отказа“ или със също толкова недвусмислен израз.',
    url: 'https://eur-lex.europa.eu/legal-content/BG/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'es',
    languageName: 'Spanish',
    withdrawLabel: 'desistir del contrato aquí',
    confirmLabel: 'confirmar desistimiento',
    withdrawSentence: 'La función de desistimiento se etiquetará con la expresión “desistir del contrato aquí” o una formulación inequívoca equivalente de manera fácilmente legible.',
    confirmSentence: 'Esta función de confirmación se etiquetará de manera fácilmente legible y únicamente con la expresión “confirmar desistimiento” o una formulación inequívoca equivalente.',
    url: 'https://eur-lex.europa.eu/legal-content/ES/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'cs',
    languageName: 'Czech',
    withdrawLabel: 'zde odstoupit od smlouvy',
    confirmLabel: 'potvrdit odstoupení od smlouvy',
    withdrawSentence: 'Funkce pro odstoupení od smlouvy musí být označena slovy „zde odstoupit od smlouvy“ nebo odpovídající jednoznačnou formulací vyjádřenou snadno čitelným způsobem.',
    confirmSentence: 'Tato funkce pro potvrzení musí být označena snadno čitelným způsobem slovy „potvrdit odstoupení od smlouvy“ nebo odpovídající jednoznačnou formulací.',
    url: 'https://eur-lex.europa.eu/legal-content/CS/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'da',
    languageName: 'Danish',
    withdrawLabel: 'Fortryd aftale',
    confirmLabel: 'Bekræft fortrydelse',
    withdrawSentence: 'Fortrydelsesfunktionen skal være mærket med ordene »Fortryd aftale« eller en tilsvarende utvetydig formulering på en letlæselig måde.',
    confirmSentence: 'Denne bekræftelsesfunktion skal være mærket på en letlæselig måde og kun med ordene »Bekræft fortrydelse« eller en tilsvarende utvetydig formulering.',
    url: 'https://eur-lex.europa.eu/legal-content/DA/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'de',
    languageName: 'German',
    withdrawLabel: 'Vertrag widerrufen',
    confirmLabel: 'Widerruf bestätigen',
    withdrawSentence: 'Die Widerrufsfunktion wird gut lesbar mit den Worten „Vertrag widerrufen“ oder einer entsprechenden eindeutigen Formulierung gekennzeichnet.',
    confirmSentence: 'Diese Bestätigungsfunktion wird gut lesbar und ausschließlich mit den Worten „Widerruf bestätigen“ oder einer entsprechenden eindeutigen Formulierung gekennzeichnet.',
    url: 'https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'et',
    languageName: 'Estonian',
    withdrawLabel: 'Taganen lepingust',
    confirmLabel: 'Kinnitan taganemise',
    withdrawSentence: 'Taganemisfunktsioon tähistatakse sõnadega „Taganen lepingust“ või sarnase üheti mõistetava väljendiga kergesti loetaval viisil.',
    confirmSentence: 'Kinnitusfunktsioon tähistatakse kergesti loetaval viisil sõnadega „Kinnitan taganemise“ või sarnase üheti mõistetava väljendiga.',
    url: 'https://eur-lex.europa.eu/legal-content/ET/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'el',
    languageName: 'Greek',
    withdrawLabel: 'Πατήστε εδώ για υπαναχώρηση',
    confirmLabel: 'επιβεβαίωση υπαναχώρησης',
    withdrawSentence: 'Η λειτουργία υπαναχώρησης φέρει την ένδειξη «Πατήστε εδώ για υπαναχώρηση» ή σαφή αντίστοιχη διατύπωση με ευανάγνωστο τρόπο.',
    confirmSentence: 'Η εν λόγω λειτουργία επιβεβαίωσης επισημαίνεται με ευανάγνωστο τρόπο και μόνο με τις λέξεις «επιβεβαίωση υπαναχώρησης» ή με σαφή αντίστοιχη διατύπωση.',
    url: 'https://eur-lex.europa.eu/legal-content/EL/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'en',
    languageName: 'English',
    withdrawLabel: 'withdraw from contract here',
    confirmLabel: 'confirm withdrawal',
    withdrawSentence: 'The withdrawal function shall be labelled with the words “withdraw from contract here” or an unambiguous corresponding formulation in an easily legible way.',
    confirmSentence: 'That confirmation function shall be labelled in an easily legible manner, and only with the words “confirm withdrawal” or with an unambiguous corresponding formulation.',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'fr',
    languageName: 'French',
    withdrawLabel: 'renoncer au contrat ici',
    confirmLabel: 'confirmer la rétractation',
    withdrawSentence: 'La fonction de rétractation porte une mention comportant les mots “renoncer au contrat ici” ou une formule analogue dénuée d’ambiguïté, qui soit facilement lisible.',
    confirmSentence: 'Cette fonction de confirmation porte une mention facilement lisible et comportant les seuls mots “confirmer la rétractation” ou une formule tout aussi dénuée d’ambiguïté.',
    url: 'https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'ga',
    languageName: 'Irish',
    withdrawLabel: 'tarraing siar ón gconradh anseo',
    confirmLabel: 'dearbhaigh an tarraingt siar',
    withdrawSentence: 'Déanfar an fheidhm tarraingt siar a lipéadú leis na focail ‘tarraing siar ón gconradh anseo’ nó le foirmliú comhfhreagrach gan débhrí, ar bhealach soléite.',
    confirmSentence: 'Déanfar an fheidhm dhearbhúcháin sin a lipéadú ar bhealach soléite leis na focail ‘dearbhaigh an tarraingt siar’ nó le foirmliú comhfhreagrach gan débhrí.',
    url: 'https://eur-lex.europa.eu/legal-content/GA/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'hr',
    languageName: 'Croatian',
    withdrawLabel: 'odustati od ugovora',
    confirmLabel: 'potvrditi odustajanje',
    withdrawSentence: 'Funkcija odustajanja označuje se riječima ‚odustati od ugovora’ ili nedvosmislenom odgovarajućom formulacijom koja je lako čitljiva.',
    confirmSentence: 'Ta funkcija potvrde mora biti lako čitljiva te označena samo riječima ‚potvrditi odustajanje’ ili nedvosmislenom odgovarajućom formulacijom.',
    url: 'https://eur-lex.europa.eu/legal-content/HR/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'it',
    languageName: 'Italian',
    withdrawLabel: 'recedere dal contratto qui',
    confirmLabel: 'conferma recesso',
    withdrawSentence: 'La funzionalità di recesso è indicata dalle parole “recedere dal contratto qui” o da una inequivocabile formulazione corrispondente in modo facilmente leggibile.',
    confirmSentence: 'Tale funzionalità di conferma deve essere indicata in modo facilmente leggibile, e soltanto con le parole “conferma recesso” o una formulazione altrettanto inequivocabile.',
    url: 'https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'lv',
    languageName: 'Latvian',
    withdrawLabel: 'Atteikties no līguma',
    confirmLabel: 'Apstiprināt atteikumu',
    withdrawSentence: 'Atteikuma funkciju apzīmē ar vārdiem “Atteikties no līguma” vai ar nepārprotamu atbilstošu formulējumu viegli salasāmā veidā.',
    confirmSentence: 'Šo apstiprināšanas funkciju apzīmē viegli salasāmā veidā un tikai ar vārdiem “Apstiprināt atteikumu” vai ar nepārprotamu atbilstošu formulējumu.',
    url: 'https://eur-lex.europa.eu/legal-content/LV/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'lt',
    languageName: 'Lithuanian',
    withdrawLabel: 'atsisakyti sutarties čia',
    confirmLabel: 'patvirtinti sutarties atsisakymą',
    withdrawSentence: 'Sutarties atsisakymo funkcija pažymima žodžiais „atsisakyti sutarties čia“ arba atitinkama nedviprasmiška formuluote, kuri turi būti lengvai įskaitoma.',
    confirmSentence: 'Ta patvirtinimo funkcija pažymima lengvai įskaitomais žodžiais „patvirtinti sutarties atsisakymą“ arba vienodai nedviprasmiška formuluote.',
    url: 'https://eur-lex.europa.eu/legal-content/LT/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'hu',
    languageName: 'Hungarian',
    withdrawLabel: 'elállás a szerződéstől',
    confirmLabel: 'elállás megerősítése',
    withdrawSentence: 'Az elállási funkciót az „elállás a szerződéstől” szöveggel vagy egy annak megfelelő más, egyértelműen megfogalmazott, könnyen olvasható szöveggel kell ellátni.',
    confirmSentence: 'Az említett megerősítő funkciót könnyen olvasható módon és az „elállás megerősítése” szöveggel vagy más, ugyanilyen egyértelműen megfogalmazott szöveggel kell ellátni.',
    url: 'https://eur-lex.europa.eu/legal-content/HU/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'mt',
    languageName: 'Maltese',
    withdrawLabel: 'irtira mill-kuntratt hawnhekk',
    confirmLabel: 'ikkonferma r-reċess',
    withdrawSentence: 'Il-funzjoni ta’ reċess għandha tkun ittikkettata bil-kliem ‘irtira mill-kuntratt hawnhekk’ jew formulazzjoni korrispondenti mhux ambigwa b’mod li tinqara faċilment.',
    confirmSentence: 'Dik il-funzjoni ta’ konferma għandha tkun ittikkettata b’mod li jinqara faċilment, u biss bil-kliem ‘ikkonferma r-reċess’ jew b’formulazzjoni korrispondenti mhux ambigwa.',
    url: 'https://eur-lex.europa.eu/legal-content/MT/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'nl',
    languageName: 'Dutch',
    withdrawLabel: 'hier de overeenkomst herroepen',
    confirmLabel: 'herroeping bevestigen',
    withdrawSentence: 'De herroepingsfunctie wordt op een gemakkelijk leesbare manier aangeduid met de woorden “hier de overeenkomst herroepen” of een ondubbelzinnige overeenkomstige formulering.',
    confirmSentence: 'Die bevestigingsfunctie wordt op een goed leesbare manier aangeduid, en alleen met de woorden “herroeping bevestigen” of met een andere ondubbelzinnige overeenkomstige formulering.',
    url: 'https://eur-lex.europa.eu/legal-content/NL/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'pl',
    languageName: 'Polish',
    withdrawLabel: 'odstąp od umowy tutaj',
    confirmLabel: 'potwierdź odstąpienie od umowy',
    withdrawSentence: 'Funkcja odstąpienia od umowy jest oznaczona słowami „odstąp od umowy tutaj” lub odpowiadającym im jednoznacznym sformułowaniem w czytelnej formie.',
    confirmSentence: 'Ta funkcja potwierdzenia jest oznaczona w czytelny sposób słowami „potwierdź odstąpienie od umowy” lub odpowiadającym im jednoznacznym sformułowaniem.',
    url: 'https://eur-lex.europa.eu/legal-content/PL/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'pt',
    languageName: 'Portuguese',
    withdrawLabel: 'retrate-se do contrato aqui',
    confirmLabel: 'confirmar retratação',
    withdrawSentence: 'A função de retratação é identificada com a expressão «retrate-se do contrato aqui» ou uma formulação inequívoca correspondente, de forma facilmente legível.',
    confirmSentence: 'Essa função de confirmação é identificada de forma facilmente legível e só com a expressão “confirmar retratação” ou uma formulação inequívoca correspondente.',
    url: 'https://eur-lex.europa.eu/legal-content/PT/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'ro',
    languageName: 'Romanian',
    withdrawLabel: 'retrageți-vă din contract aici',
    confirmLabel: 'confirmați retragerea',
    withdrawSentence: 'Funcția de retragere este etichetată cu mențiunea «retrageți-vă din contract aici» sau o formulare similară, lipsită de ambiguitate, într-un mod ușor de citit.',
    confirmSentence: 'Funcția de confirmare respectivă este etichetată într-un mod ușor de citit și numai cu mențiunea «confirmați retragerea» sau o formulare similară, lipsită de ambiguitate.',
    url: 'https://eur-lex.europa.eu/legal-content/RO/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'sk',
    languageName: 'Slovak',
    withdrawLabel: 'odstúpiť od zmluvy tu',
    confirmLabel: 'potvrdiť odstúpenie od zmluvy',
    withdrawSentence: 'Funkcia odstúpenia od zmluvy sa označí ľahko čitateľným spôsobom slovami „odstúpiť od zmluvy tu“ alebo jednoznačnou zodpovedajúcou formuláciou.',
    confirmSentence: 'Uvedená funkcia potvrdenia sa označí ľahko čitateľným spôsobom a len slovami „potvrdiť odstúpenie od zmluvy“ alebo rovnako jednoznačnou zodpovedajúcou formuláciou.',
    url: 'https://eur-lex.europa.eu/legal-content/SK/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'sl',
    languageName: 'Slovenian',
    withdrawLabel: 'kliknite tukaj za odstop od pogodbe',
    confirmLabel: 'potrdi odstop od pogodbe',
    withdrawSentence: 'Funkcija za odstop od pogodbe se označi z besedami „kliknite tukaj za odstop od pogodbe“ ali z ustrezno nedvoumno izjavo, ki je lahko berljiva.',
    confirmSentence: 'Ta funkcija za potrditev se označi na lahko berljiv način in samo z besedami „potrdi odstop od pogodbe“ ali z ustrezno nedvoumno izjavo.',
    url: 'https://eur-lex.europa.eu/legal-content/SL/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'fi',
    languageName: 'Finnish',
    withdrawLabel: 'Peruuta sopimus tästä',
    confirmLabel: 'Vahvista peruuttaminen',
    withdrawSentence: 'Peruuttamistoiminto on merkittävä sanoilla ”Peruuta sopimus tästä” tai vastaavalla yksiselitteisellä ilmaisulla helposti luettavalla tavalla.',
    confirmSentence: 'Kyseinen vahvistustoiminto on merkittävä helposti luettavalla tavalla ja ainoastaan sanoilla ”Vahvista peruuttaminen” tai vastaavalla yksiselitteisellä muotoilulla.',
    url: 'https://eur-lex.europa.eu/legal-content/FI/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
  {
    language: 'sv',
    languageName: 'Swedish',
    withdrawLabel: 'ångra avtalet här',
    confirmLabel: 'bekräfta frånträde',
    withdrawSentence: 'Ångerfunktionen ska märkas med orden ”ångra avtalet här” eller en otvetydig motsvarande formulering på ett lättläst sätt.',
    confirmSentence: 'Den bekräftelsefunktionenen ska märkas på ett lättläst sätt med orden ”bekräfta frånträde” eller med en otvetydig motsvarande formulering.',
    url: 'https://eur-lex.europa.eu/legal-content/SV/TXT/HTML/?uri=CELEX:32023L2673',
    source: 'official',
  },
].map((entry) => Object.freeze(entry as OfficialLabels)));

/** ELI of Directive (EU) 2023/2673 on EUR-Lex. */
export const DIRECTIVE_2023_2673_ELI = 'https://eur-lex.europa.eu/eli/dir/2023/2673/oj';

/** ELI of Directive 2011/83/EU (Consumer Rights Directive) on EUR-Lex. */
export const DIRECTIVE_2011_83_ELI = 'https://eur-lex.europa.eu/eli/dir/2011/83/oj';
