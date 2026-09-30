// Przykładowe dane (tryb demo i przycisk „Wgraj przykładowe dane” w panelu).
export function seedData(autor = { uid: 'seed', nazwa: 'System' }) {
  const now = Date.now();
  const MIN = 60e3, H = 60 * MIN, D = 24 * H;
  const at = (ms) => new Date(Math.round((now + ms) / MIN) * MIN);

  const st = (id, nazwa, kod, x, y, z, extra = {}) => ({
    id, nazwa, kod, x, y, z, wymiar: 'overworld', status: 'czynna', opis: '', ...extra,
  });
  const stacje = [
    st('cen', 'Centralna', 'CEN', 0, 64, 0, { opis: 'Główny węzeł przesiadkowy tuż pod spawnem. Perony 1–4.' }),
    st('wos', 'Wioska Osadników', 'WOS', -320, 70, -410, { opis: 'Wyjście prosto na targ z wieśniakami.' }),
    st('fpn', 'Farma Północna', 'FPN', -150, 68, -980),
    st('ppn', 'Port Północny', 'PPN', 40, 63, -1650, { opis: 'Przesiadka na łodzie w stronę wysp.' }),
    st('lbr', 'Las Brzozowy', 'LBR', 520, 72, 180),
    st('zam', 'Zamek', 'ZAM', 1100, 88, 260, { opis: 'Stacja pod dziedzińcem zamku.' }),
    st('lsz', 'Lodowe Szczyty', 'LSZ', 1750, 120, -90, { status: 'zamknieta', opis: 'Stacja górska — uważaj na zamarznięte kałuże.' }),
    st('pus', 'Pustynia', 'PUS', -200, 66, 900),
    st('kdi', 'Kopalnia Diamentów', 'KDI', -480, -52, 1500, { opis: 'Stacja podziemna na poziomie Y -52.' }),
    st('nhb', 'Nether Hub', 'NHB', 0, 100, 0, { wymiar: 'nether', opis: 'Nad portalem ze spawnu.' }),
    st('nft', 'Forteca Netheru', 'NFT', 230, 72, -310, { wymiar: 'nether', status: 'budowa' }),
  ];

  const r = (...pairs) => pairs.map(([stacja, czas]) => ({ stacja, czas: czas ?? null }));
  const linie = [
    { id: 's1', nazwa: 'S1', kolor: '#d62828', typ: 'osobowa', status: 'czynna', opis: 'Centralna – Port Północny', trasa: r(['cen'], ['wos', 3], ['fpn', 4], ['ppn', 5]) },
    { id: 's2', nazwa: 'S2', kolor: '#1d6fd6', typ: 'osobowa', status: 'czynna', opis: 'Centralna – Lodowe Szczyty', trasa: r(['cen'], ['lbr', 3], ['zam', 4], ['lsz', 6]).map((t) => (t.stacja === 'lbr' ? { ...t, nz: true } : t)) },
    { id: 'ic1', nazwa: 'IC Północ–Południe', kolor: '#f2a900', typ: 'ekspres', status: 'czynna', opis: 'Ekspres przez całą mapę', trasa: r(['ppn'], ['cen', 6], ['pus', 4], ['kdi', 3]) },
    { id: 'n1', nazwa: 'N1', kolor: '#7b2cbf', typ: 'metro', status: 'budowa', opis: 'Metro w Netherze', trasa: r(['nhb'], ['nft', 2]) },
  ];

  const k = (id, o) => {
    const created = o.utworzono || at(-(o.createdAgo || 2 * H));
    return {
      id, objazd: [], stacje: [], linie: [], zakonczony: false, do: null, ...o,
      autor, utworzono: created, zmieniono: created, zmienil: autor,
      historia: [{ akcja: 'utworzono', uid: autor.uid, nazwa: autor.nazwa, kiedy: created }],
    };
  };

  const komunikaty = [
    k('k1', {
      tytul: 'Wstrzymany ruch na odcinku Zamek – Lodowe Szczyty',
      typ: 'zawieszenie', waznosc: 'wysoka', linie: ['s2'], stacje: ['zam', 'lsz'],
      od: at(-5 * H), do: at(1 * D),
      tresc: 'Eksplozja creepera zniszczyła tory na moście nad wąwozem.\n\n**Pociągi S2 kursują tylko na odcinku Centralna – Zamek.**\n\nDo Lodowych Szczytów można dojść pieszo szlakiem od Zamku (ok. 650 kratek na wschód).',
    }),
    k('k2', {
      tytul: 'Przebudowa peronu 2 na stacji Centralna',
      typ: 'prace', waznosc: 'srednia', linie: ['s1', 'ic1'], stacje: ['cen'],
      od: at(-2 * D), do: at(3 * D), createdAgo: 3 * D,
      tresc: 'Trwa wymiana torów zasilanych na peronie 2.\n- peron 2 wyłączony z ruchu\n- pociągi **S1** odjeżdżają z peronu 3\n- pociągi **IC** odjeżdżają z peronu 4',
    }),
    k('k3', {
      tytul: 'Opóźnienia przez krowy na torach',
      typ: 'utrudnienie', waznosc: 'niska', linie: ['s1'], stacje: ['fpn'],
      od: at(-30 * MIN), do: at(3 * H), createdAgo: 30 * MIN,
      tresc: 'Stado krów weszło na tory przy Farmie Północnej. Pociągi zwalniają na tym odcinku, możliwe opóźnienia do 2 minut.',
    }),
    k('k4', {
      tytul: 'IC nie zatrzyma się na stacji Pustynia',
      typ: 'zmiana_trasy', waznosc: 'srednia', linie: ['ic1'], stacje: ['pus'],
      od: at(2 * D), do: at(4 * D), createdAgo: 5 * H,
      objazd: ['ppn', 'cen', 'kdi'],
      tresc: 'W związku z budową nowej stacji podziemnej pociągi IC pojadą bez zatrzymania na stacji Pustynia.',
    }),
    k('k5', {
      tytul: 'Metro N1 w Netherze w budowie',
      typ: 'informacja', waznosc: 'niska', linie: ['n1'], stacje: [],
      od: at(-7 * D), do: null, createdAgo: 7 * D,
      tresc: 'Budujemy linię metra od Nether Hub do Fortecy. Na razie nie wchodź na tory — ruch testowy!',
    }),
    k('k6', {
      tytul: 'Zablokowane tory przy Wiosce Osadników',
      typ: 'utrudnienie', waznosc: 'wysoka', linie: ['s1'], stacje: ['wos'],
      od: at(-3 * D), do: at(-2 * D), createdAgo: 3 * D,
      tresc: 'Wieśniak utknął na torach. Problem usunięty.',
    }),
  ];
  komunikaty.forEach((x) => delete x.createdAgo);

  return { stacje, linie, komunikaty };
}
