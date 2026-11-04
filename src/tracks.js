// ============================================================================
//  CIRCUITS: per-track data (distances in nominal metres from the timing line)
// ============================================================================
// Approximate elevation profile of Spa (m, relative to the lowest point near Stavelot).
// Distances are measured from the timing line, clockwise. ~102 m total difference.
const SPA_ELEV = [
  [0, 55], [200, 58], [400, 60], [560, 56], [760, 45], [900, 35], [1000, 26], [1065, 21], [1110, 23],
  [1160, 30], [1220, 42], [1290, 53], [1400, 60], [1700, 74], [2000, 87], [2300, 97], [2430, 100],
  [2550, 99], [2680, 95], [2850, 88], [3050, 80], [3200, 72], [3300, 66], [3550, 55], [3850, 44],
  [4050, 38], [4300, 33], [4550, 28], [4700, 24], [4950, 14], [5180, 3], [5350, 0], [5550, 2],
  [5800, 10], [6000, 18], [6210, 28], [6450, 38], [6750, 48], [6900, 52], [7000, 55]
];

// Corners (distance of the apex from the timing line)
const SPA_CORNERS = [
  { s: 400, name: 'La Source', n: 1 },
  { s: 1062, name: 'Eau Rouge', n: 2 },
  { s: 1140, name: 'Raidillon', n: 3 },
  { s: 1520, name: 'Kemmel', n: 0 },
  { s: 2428, name: 'Les Combes', n: 5 },
  { s: 2668, name: 'Malmedy', n: 7 },
  { s: 3050, name: 'Bruxelles', n: 8 },
  { s: 3303, name: 'Speaker\'s Corner', n: 9 },
  { s: 3865, name: 'Pouhon', n: 10 },
  { s: 4542, name: 'Fagnes', n: 12 },
  { s: 4952, name: 'Campus', n: 14 },
  { s: 5180, name: 'Stavelot', n: 15 },
  { s: 5560, name: 'Paul Frère', n: 16 },
  { s: 6211, name: 'Blanchimont', n: 17 },
  { s: 6745, name: 'Chicane', n: 18 },
  { s: 6815, name: 'Chicane', n: 19, noBoard: true }
];
const SPA_SECTORS = [2250, 5300]; // sector boundaries (m)

// Run-off overrides [sFrom, sTo, side('L'|'R'|'B'), width(m), type]
const SPA_RUNOFF = [
  [300, 500, 'L', 32, 'tarmac'], [300, 500, 'R', 10, 'tarmac'],
  [990, 1180, 'R', 16, 'tarmac'], [1100, 1360, 'L', 26, 'gravel'],
  [2360, 2600, 'L', 34, 'tarmac'], [2600, 2720, 'L', 22, 'tarmac'],
  [2950, 3140, 'L', 30, 'tarmac'], [3260, 3340, 'R', 18, 'tarmac'],
  [3760, 4060, 'R', 30, 'gravel'], [4480, 4600, 'L', 24, 'tarmac'], [4600, 4720, 'R', 20, 'tarmac'],
  [4900, 5000, 'L', 24, 'tarmac'], [5100, 5260, 'L', 34, 'gravel'],
  [6130, 6300, 'R', 32, 'tarmac'], [6660, 6900, 'B', 22, 'tarmac']
];

// Monza: almost flat (≈ 10 m between the pit straight and the Lesmo / Serraglio area)
const MONZA_ELEV = [[0, 2.6], [150, 3.4], [300, 4.2], [450, 5.0], [600, 5.8], [750, 6.6], [900, 7.4], [1050, 8.4], [1200, 9.2], [1350, 9.5], [1500, 9.4], [1650, 10.1], [1800, 11.6], [1950, 12.5], [2100, 12.4], [2250, 11.7], [2400, 10.9], [2550, 9.6], [2700, 9.2], [2850, 9.0], [3000, 8.4], [3150, 8.3], [3300, 8.6], [3450, 6.1], [3600, 3.4], [3750, 5.4], [3900, 6.8], [4050, 6.0], [4200, 5.4], [4350, 4.5], [4500, 3.5], [4650, 2.7], [4800, 1.9], [4950, 1.0], [5100, 0.4], [5250, -0.2], [5400, 0.5], [5550, 1.2], [5700, 2.2], [5788, 2.6]];
const MONZA_CORNERS = [
  { s: 935, name: 'Variante del Rettifilo', n: 1 },
  { s: 1380, name: 'Curva Biassono', n: 3 },
  { s: 2168, name: 'Variante della Roggia', n: 4 },
  { s: 2560, name: 'Lesmo 1', n: 6 },
  { s: 2880, name: 'Lesmo 2', n: 7 },
  { s: 3420, name: 'Serraglio', n: 0 },
  { s: 4040, name: 'Variante Ascari', n: 8 },
  { s: 5280, name: 'Curva Alboreto', n: 11 }
];
const MONZA_RUNOFF = [
  [470, 800, 'B', 14, 'grass'], [800, 1010, 'L', 40, 'tarmac'], [900, 1075, 'R', 14, 'tarmac'], [1010, 1080, 'L', 22, 'tarmac'],
  [1120, 1620, 'L', 30, 'gravel'], [1620, 1700, 'L', 18, 'tarmac'],
  [2040, 2172, 'R', 34, 'gravel'], [2164, 2262, 'L', 18, 'tarmac'],
  [2470, 2660, 'L', 26, 'gravel'], [2800, 2950, 'L', 24, 'gravel'],
  [3870, 4010, 'R', 30, 'gravel'], [4000, 4112, 'R', 30, 'grass'], [3900, 4012, 'L', 30, 'grass'], [4010, 4110, 'L', 24, 'gravel'], [4110, 4220, 'R', 26, 'tarmac'],
  [5060, 5470, 'L', 36, 'tarmac'], [5150, 5450, 'R', 8, 'grass']
];

// Albert Park: street/park circuit, practically flat (a few metres over the lap)
const ALBERT_ELEV = [
  [0, 3], [600, 3.4], [1200, 4.6], [1700, 5.3], [2200, 5.6], [2700, 4.8], [3200, 3.6], [3700, 2.8], [4200, 2.4], [4700, 2.6], [5100, 2.9], [5211, 3]
];
// metres along the (smoothed) centreline; the 2018 T9-T10 chicane is replaced by the current flat-out kink
const ALBERT_CORNERS = [
  { s: 560, name: 'Curva 1', n: 1 },
  { s: 705, name: 'Curva 2-3', n: 2 },
  { s: 1285, name: 'Curva 4', n: 4 },
  { s: 1423, name: 'Curva 5', n: 5 },
  { s: 1638, name: 'Curva 6', n: 6 },
  { s: 2058, name: 'Curva 7', n: 7 },
  { s: 2160, name: 'Curva 8', n: 8, noBoard: true },
  { s: 3483, name: 'Curva 11', n: 11 },
  { s: 3605, name: 'Curva 12', n: 12, noBoard: true },
  { s: 4286, name: 'Curva 13', n: 13 },
  { s: 4528, name: 'Curva 14', n: 14 },
  { s: 4788, name: 'Curva 15', n: 15 },
  { s: 4923, name: 'Curva 16', n: 16 }
];
const ALBERT_RUNOFF = [
  [470, 600, 'L', 36, 'tarmac'], [600, 760, 'R', 24, 'tarmac'], [1220, 1370, 'L', 28, 'gravel'], [1380, 1490, 'R', 22, 'gravel'],
  [1590, 1700, 'L', 26, 'gravel'], [2010, 2110, 'L', 22, 'tarmac'], [3430, 3540, 'R', 26, 'gravel'], [3560, 3660, 'L', 24, 'tarmac'],
  [4230, 4350, 'L', 30, 'gravel'], [4470, 4610, 'L', 24, 'tarmac'], [4720, 4860, 'R', 30, 'gravel'], [4860, 5010, 'L', 26, 'tarmac']
];

// stands: [sFrom, sTo, side (+1 left / -1 right), gap to barrier, tiers, roof]
const TRACK_DEFS = {
  spa: {
    id: 'spa', name: 'Spa-Francorchamps', title: 'ARMK Racing · Spa', mark: 'SPA',
    sub: 'Circuit de Spa-Francorchamps · 7,004 km · 19 curvas · +102 m de desnivel',
    raw: () => SPA_RAW, nom: 7000, elev: SPA_ELEV, corners: SPA_CORNERS, sectors: SPA_SECTORS, runoff: SPA_RUNOFF,
    widen: [[6660, 6700, 6900, 6860, 7.4]],             // Bus Stop: wide switchback
    tyres: [[330, 470, 1], [2380, 2480, 1], [3800, 3960, -1], [5110, 5250, 1], [6150, 6290, -1], [6700, 6760, 1]],
    straight: [6905, 250],                              // concrete walls both sides
    pitTr: [[6838, 6905]],                              // pit entry: band emerges from a close barrier
    pit: [6835, 6925, 210, 210],                        // band from a0 (full at a1) to b0 (fades out by b0, starts fading b1); here it ends at 210
    // pit exit road (as on the real circuit since 2007): leaves the pit lane before La Source, crosses inside the hairpin
    // and joins on the right of the run down to Eau Rouge
    escape: { from: 210, to: 620, rejoin: -4, hw: 4.5, pit: true, follow: true },
    saus: [[6738, 6768, -1], [6798, 6830, 1]],
    startS: 190, brakeBanner: { s: 6642, text: 'SPA-FRANCORCHAMPS' }, boards: [355, 2385, 2995, 4905, 5120, 6735],
    bridges: [[1700, '#2f63b8'], [5620, '#c0392b']], vergeSkip: [6840, 330],
    stands: [
      [6905, 150, 1, 4, 14, true], [330, 470, 1, 6, 10, true], [955, 1060, -1, 8, 16, true], [990, 1085, 1, 10, 12, true],
      [1165, 1290, 1, 10, 18, true], [2380, 2470, 1, 6, 9, true], [3000, 3080, 1, 8, 7, false], [3790, 3930, -1, 8, 9, false],
      [6140, 6260, -1, 6, 9, true], [6690, 6800, 1, 6, 10, true], [6820, 6880, -1, 6, 8, true]
    ],
    labels: [[400, 'LA SOURCE', 6, -4], [1140, 'RAIDILLON', 6, 4], [2428, 'LES COMBES', -58, 12], [3865, 'POUHON', 6, 10], [5180, 'STAVELOT', -10, 14], [6211, 'BLANCHIMONT', 4, 0]],
    scenery: { hills: 95, conifer: 0.66, dens: 0.47, flat: false },
    load: ['Trazando Spa-Francorchamps…', 'Valles y colinas de las Ardenas…', 'Tribunas, boxes y La Source…']
  },
  monza: {
    id: 'monza', name: 'Monza', title: 'ARMK Racing · Monza', mark: 'MZA',
    sub: 'Autodromo Nazionale Monza · 5,793 km · 11 curvas · el templo de la velocidad',
    raw: () => MONZA_RAW, nom: 5789, elev: MONZA_ELEV, corners: MONZA_CORNERS, sectors: [1960, 4250], runoff: MONZA_RUNOFF,
    widen: [[300, 380, 1000, 985, 7.6]],
    tyres: [[900, 945, 1], [955, 1010, -1], [2100, 2162, -1], [2172, 2215, 1], [4000, 4110, 1], [5150, 5300, 1]],   // chicanes (Rettifilo, Roggia): one wall per corner, each on its outside
    straight: [5560, 380],
    pitTr: [[5480, 5560], [380, 470]],
    pit: [5475, 5575, 470, 380],
    saus: [[918, 945, -1], [962, 990, 1], [2133, 2160, 1], [2177, 2204, -1]],
    // Rettifilo escape road: straight on from the braking zone, rejoins after T2; foam blocks force a slalom
    escape: { from: 860, to: 1110, rejoin: 3.0, hw: 6.5, blocks: [[0.5, -2.8, 7.5, 1.1], [0.66, 2.8, 7.5, 1.1]] },
    startS: 260, brakeBanner: { s: 760, text: 'AUTODROMO NAZIONALE MONZA' }, boards: [920, 2120, 2490, 2850, 3930, 5115],
    bridges: [[1760, '#1f6f3a'], [3250, '#c0392b'], [4620, '#2f63b8']], vergeSkip: [5560, 470],
    stands: [
      [5600, 140, 1, 4, 16, true], [145, 420, 1, 5, 10, true], [640, 880, 1, 8, 14, true], [1130, 1230, 1, 10, 10, true],
      [2040, 2140, -1, 8, 11, true], [2470, 2560, 1, 8, 8, false], [3880, 3990, -1, 8, 12, true], [4120, 4220, 1, 8, 8, false],
      [5120, 5380, 1, 8, 15, true]
    ],
    labels: [[940, 'RETTIFILO', -64, 10], [1380, 'BIASSONO', -60, 4], [2165, 'ROGGIA', -10, -8], [2700, 'LESMO', 8, 0], [4040, 'ASCARI', 8, 6], [5280, 'PARABOLICA', 8, 6]],
    scenery: { hills: 18, conifer: 0.12, dens: 0.36, flat: true, oval: true, podium: true },
    load: ['Trazando Monza…', 'El parque de Monza…', 'Tribunas, boxes y la Sopraelevata…']
  },
  albertpark: {
    id: 'albertpark', name: 'Albert Park', title: 'ARMK Racing · Albert Park', mark: 'MEL',
    sub: 'Albert Park Circuit · Melbourne · 5,28 km · el lago y la ciudad',
    raw: () => ALBERT_RAW, nom: 5211, elev: ALBERT_ELEV, corners: ALBERT_CORNERS, sectors: [1740, 3480], runoff: ALBERT_RUNOFF,
    tyres: [[535, 600, 1], [1270, 1330, 1], [1625, 1690, 1], [3480, 3530, -1], [4280, 4340, 1], [4780, 4840, -1], [4920, 4990, 1]],
    straight: [5030, 330],
    pitTr: [[4985, 5030], [330, 395]],
    pit: [4985, 5045, 395, 330],
    saus: [[4765, 4800, 1], [4900, 4945, -1]],
    startS: 190, brakeBanner: { s: 420, text: 'ALBERT PARK · MELBOURNE' }, boards: [535, 1253, 1390, 1615, 2035, 3458, 3583, 4261, 4498, 4758, 4883],
    bridges: [[1000, '#2f63b8'], [3000, '#c0392b'], [4000, '#1f6f3a']], vergeSkip: [4990, 395],
    stands: [
      [5061, 282, 1, 5, 14, true], [494, 613, 1, 7, 10, true], [613, 692, -1, 7, 8, false], [751, 801, -1, 8, 6, false],
      [3529, 3628, 1, 8, 8, false], [3687, 3756, 1, 10, 12, true], [4795, 4864, -1, 8, 8, false], [4864, 4953, 1, 8, 12, true]
    ],
    labels: [[560, 'T1', 8, 6], [1285, 'T4', 8, 4], [1638, 'T6', -16, 12], [2058, 'T7', 8, 0], [2650, 'T9-10', 8, 0], [3483, 'T11', 8, 0], [4286, 'T13', -26, 6], [4788, 'T15', -8, 14]],
    scenery: { hills: 0, conifer: 0, dens: 0.4, flat: true, noHills: true, lake: ALBERT_LAKE, skyline: true },
    load: ['Trazando Albert Park…', 'Parque y lago de Melbourne…', 'Tribunas, boxes y el skyline…']
  }
};

// Autódromo de Tocancipá (Sabana de Bogotá, 2.600 m): flat; layouts from the Assetto Corsa track (Elias Viejo, Daniel Jimenez)
const TOCA_SCENERY = { hills: 75, conifer: 0.35, dens: 0.12, flat: true, hillsY: 1.3, toca: true };
// Autódromo de Tocancipá, fixed venue frame shared by every layout (raw data coordinates): the main straight from its SE end (s0) to its
// NW end (s1), and a point of the infield (the side of the pits, paddock and the return road from the hairpin, as in the aerial photo)
const TOCA_VENUE = { s0: [-166.1, -132.2], s1: [-492.9, 242.5], infield: [-160, 50] };
const TOCA_DEFS = {
  toca_largo: {"id": "toca_largo", "pitDepth": 10, "tower": false, "name": "Tocancipá", "layout": "Largo", "title": "ARMK Racing · Tocancipá", "mark": "TOC", "sub": "Autódromo de Tocancipá · Circuito largo · 2,68 km · horario", "nom": 2676, "elev": [[0, 2], [2676, 2]], "corners": [{"s": 334, "name": "Curva 1", "n": 1}, {"s": 463, "name": "Curva 2", "n": 2}, {"s": 563, "name": "Curva 3", "n": 3}, {"s": 701, "name": "Curva 4", "n": 4}, {"s": 797, "name": "Curva 5", "n": 5}, {"s": 1041, "name": "Curva 6", "n": 6}, {"s": 1140, "name": "Curva 7", "n": 7}, {"s": 1519, "name": "Curva 8", "n": 8}, {"s": 1727, "name": "Curva 9", "n": 9}, {"s": 1936, "name": "Curva 10", "n": 10}, {"s": 2080, "name": "Curva 11", "n": 11}, {"s": 2228, "name": "Curva 12", "n": 12}, {"s": 2403, "name": "Curva 13", "n": 13}], "sectors": [892, 1784], "runoff": [], "tyres": [[284, 364, 1], [651, 731, -1], [1090, 1170, -1], [1886, 1966, -1], [2353, 2433, 1]], "straight": [2478, 223], "pitTr": [[2448, 2478], [223, 253]], "pit": [2448, 2498, 253, 203], "startS": 0, "boards": [279, 408, 508, 646, 742, 986, 1085, 1464], "bridges": [], "vergeSkip": [2448, 253], "stands": [[2467, 2597, 1, 14, 10, true], [274, 374, 1, 8, 8, false]], "labels": [[334, "C1", 8, 4], [563, "C3", 8, 4], [797, "C5", 8, 4], [1140, "C7", 8, 4], [1727, "C9", 8, 4], [2080, "C11", 8, 4], [2403, "C13", 8, 4]], "load": ["Trazando Tocancipá…", "La Sabana de Bogotá…", "Tribunas y boxes…"], "saus": [], "raw": () => TOCA_LARGO_RAW, "scenery": TOCA_SCENERY},
  toca_largo_r: {"id": "toca_largo_r", "pitDepth": 10, "tower": false, "pitSide": 1, "name": "Tocancipá", "layout": "Largo inverso", "title": "ARMK Racing · Tocancipá", "mark": "TOC", "sub": "Autódromo de Tocancipá · Circuito largo antihorario · 2,67 km", "nom": 2674, "elev": [[0, 2], [2674, 2]], "corners": [{"s": 290, "name": "Curva 1", "n": 1}, {"s": 443, "name": "Curva 2", "n": 2}, {"s": 609, "name": "Curva 3", "n": 3}, {"s": 752, "name": "Curva 4", "n": 4}, {"s": 1125, "name": "Curva 5", "n": 5}, {"s": 1553, "name": "Curva 6", "n": 6}, {"s": 1648, "name": "Curva 7", "n": 7}, {"s": 1885, "name": "Curva 8", "n": 8}, {"s": 1988, "name": "Curva 9", "n": 9}, {"s": 2121, "name": "Curva 10", "n": 10}, {"s": 2226, "name": "Curva 11", "n": 11}, {"s": 2363, "name": "Curva 12", "n": 12}], "sectors": [891, 1783], "runoff": [], "tyres": [[240, 320, -1], [702, 782, 1], [1598, 1678, 1], [2071, 2151, 1]], "straight": [2464, 215], "pitTr": [[2434, 2464], [215, 245]], "pit": [2434, 2484, 245, 195], "startS": 0, "boards": [235, 388, 554, 697, 1070, 1498, 1593, 1830], "bridges": [], "vergeSkip": [2434, 245], "stands": [[93, 223, -1, 14, 10, true], [230, 330, -1, 8, 8, false]], "labels": [[290, "C1", 8, 4], [609, "C3", 8, 4], [1125, "C5", 8, 4], [1648, "C7", 8, 4], [1988, "C9", 8, 4], [2226, "C11", 8, 4]], "load": ["Trazando Tocancipá…", "La Sabana de Bogotá…", "Tribunas y boxes…"], "saus": [], "raw": () => TOCA_LARGO_R_RAW, "scenery": TOCA_SCENERY},
  toca_corto: {"id": "toca_corto", "pitDepth": 10, "tower": false, "pitSide": 1, "name": "Tocancipá", "layout": "Corto inverso", "title": "ARMK Racing · Tocancipá", "mark": "TOC", "sub": "Autódromo de Tocancipá · Circuito corto antihorario · 2,02 km", "nom": 2019, "elev": [[0, 2], [2019, 2]], "corners": [{"s": 296, "name": "Curva 1", "n": 1}, {"s": 434, "name": "Curva 2", "n": 2}, {"s": 592, "name": "Curva 3", "n": 3}, {"s": 729, "name": "Curva 4", "n": 4}, {"s": 881, "name": "Curva 5", "n": 5}, {"s": 980, "name": "Curva 6", "n": 6}, {"s": 1221, "name": "Curva 7", "n": 7}, {"s": 1318, "name": "Curva 8", "n": 8}, {"s": 1460, "name": "Curva 9", "n": 9}, {"s": 1554, "name": "Curva 10", "n": 10}, {"s": 1697, "name": "Curva 11", "n": 11}], "sectors": [673, 1346], "runoff": [], "tyres": [[246, 326, -1], [679, 759, -1], [1171, 1251, -1], [1504, 1584, -1]], "straight": [1799, 201], "pitTr": [[1769, 1799], [201, 231]], "pit": [1769, 1819, 231, 181], "startS": 0, "boards": [241, 379, 537, 674, 826, 925, 1166, 1263], "bridges": [], "vergeSkip": [1769, 231], "stands": [[82, 212, -1, 14, 10, true], [236, 336, -1, 8, 8, false]], "labels": [[296, "C1", 8, 4], [592, "C3", 8, 4], [881, "C5", 8, 4], [1221, "C7", 8, 4], [1460, "C9", 8, 4], [1697, "C11", 8, 4]], "load": ["Trazando Tocancipá…", "La Sabana de Bogotá…", "Tribunas y boxes…"], "saus": [], "raw": () => TOCA_CORTO_RAW, "scenery": TOCA_SCENERY},
  toca_amp: {"id": "toca_amp", "pitDepth": 10, "tower": false, "name": "Tocancipá", "layout": "Ampliación", "title": "ARMK Racing · Tocancipá", "mark": "TOC", "sub": "Autódromo de Tocancipá · Ampliación y Curva del Motor · 2,31 km", "nom": 2307, "elev": [[0, 2], [2307, 2]], "corners": [{"s": 210, "name": "Curva 1", "n": 1}, {"s": 334, "name": "Curva 2", "n": 2}, {"s": 424, "name": "Curva 3", "n": 3}, {"s": 675, "name": "Curva 4", "n": 4}, {"s": 778, "name": "Curva 5", "n": 5}, {"s": 1177, "name": "Curva 6", "n": 6}, {"s": 1356, "name": "Curva 7", "n": 7}, {"s": 1562, "name": "Curva 8", "n": 8}, {"s": 1707, "name": "Curva 9", "n": 9}, {"s": 1856, "name": "Curva 10", "n": 10}, {"s": 2023, "name": "Curva 11", "n": 11}], "sectors": [769, 1538], "runoff": [], "tyres": [[160, 240, 1], [625, 705, -1], [1306, 1386, 1], [1806, 1886, -1]], "straight": [2108, 117], "pitTr": [[2078, 2108], [117, 147]], "pit": [2078, 2128, 147, 97], "startS": 0, "boards": [155, 279, 369, 620, 723, 1122, 1301, 1507], "bridges": [], "vergeSkip": [2078, 147], "stands": [[2097, 2227, 1, 14, 10, true], [150, 250, 1, 8, 8, false]], "labels": [[210, "C1", 8, 4], [424, "C3", 8, 4], [778, "C5", 8, 4], [1356, "C7", 8, 4], [1707, "C9", 8, 4], [2023, "C11", 8, 4]], "load": ["Trazando Tocancipá…", "La Sabana de Bogotá…", "Tribunas y boxes…"], "saus": [], "raw": () => TOCA_AMP_RAW, "scenery": TOCA_SCENERY},
  toca_mixtos: {"id": "toca_mixtos", "pitDepth": 10, "tower": false, "name": "Tocancipá", "layout": "Mixtos", "title": "ARMK Racing · Tocancipá", "mark": "TOC", "sub": "Autódromo de Tocancipá · Mixtos y Curva del Motor · 1,65 km", "nom": 1645, "elev": [[0, 2], [1645, 2]], "corners": [{"s": 212, "name": "Curva 1", "n": 1}, {"s": 331, "name": "Curva 2", "n": 2}, {"s": 424, "name": "Curva 3", "n": 3}, {"s": 669, "name": "Curva 4", "n": 4}, {"s": 780, "name": "Curva 5", "n": 5}, {"s": 919, "name": "Curva 6", "n": 6}, {"s": 1059, "name": "Curva 7", "n": 7}, {"s": 1204, "name": "Curva 8", "n": 8}, {"s": 1362, "name": "Curva 9", "n": 9}], "sectors": [548, 1097], "runoff": [], "tyres": [[162, 242, 1], [619, 699, -1], [1009, 1089, 1]], "straight": [1446, 118], "pitTr": [[1416, 1446], [118, 148]], "pit": [1416, 1466, 148, 98], "startS": 0, "boards": [157, 276, 369, 614, 725, 864, 1004, 1149], "bridges": [], "vergeSkip": [1416, 148], "stands": [[1435, 1565, 1, 14, 10, true], [152, 252, 1, 8, 8, false]], "labels": [[212, "C1", 8, 4], [424, "C3", 8, 4], [780, "C5", 8, 4], [1059, "C7", 8, 4], [1362, "C9", 8, 4]], "load": ["Trazando Tocancipá…", "La Sabana de Bogotá…", "Tribunas y boxes…"], "saus": [], "raw": () => TOCA_MIXTOS_RAW, "scenery": TOCA_SCENERY},
  toca_ovalo: {"id": "toca_ovalo", "name": "Tocancipá", "layout": "Óvalo", "title": "ARMK Racing · Tocancipá", "mark": "TOC", "sub": "Autódromo de Tocancipá · Óvalo · 0,95 km", "nom": 953, "elev": [[0, 2], [953, 2]], "corners": [{"s": 192, "name": "Curva 1", "n": 1}, {"s": 296, "name": "Curva 2", "n": 2}, {"s": 692, "name": "Curva 3", "n": 3}], "sectors": [318, 635], "runoff": [], "tyres": [[142, 222, -1]], "straight": [827, 53], "pitTr": [[777, 827], [53, 103]], "pit": [777, 827, 103, 53], "startS": 0, "brakeBanner": {"s": 120, "text": "AUTÓDROMO DE TOCANCIPÁ"}, "boards": [137, 241, 637], "bridges": [], "vergeSkip": [777, 103], "stands": [[817, 73, 1, 5, 10, true], [132, 232, 1, 8, 8, false]], "labels": [[192, "C1", 8, 4], [692, "C3", 8, 4]], "load": ["Trazando Tocancipá…", "La Sabana de Bogotá…", "Tribunas y boxes…"], "saus": [], "raw": () => TOCA_OVALO_RAW, "scenery": TOCA_SCENERY},
};
Object.assign(TRACK_DEFS, TOCA_DEFS);

// Circuit de Monaco: geometry, walls, kerbs, heights and the city measured on the Assetto Corsa model (data_monaco.js, tools/prep_monaco).
// Street circuit: asphalt widths as built (exactW, down to 3.6 m half-width), barriers where the model has them (bar), tarmac behind them.
const MONACO_CORNERS = [
  { s: 220, name: 'Sainte-Dévote', n: 1 }, { s: 505, name: 'Beau Rivage', n: 2, noBoard: true }, { s: 770, name: 'Massenet', n: 3 },
  { s: 900, name: 'Casino', n: 4 }, { s: 1130, name: 'Mirabeau', n: 5 }, { s: 1270, name: 'Horquilla', n: 6 },
  { s: 1345, name: 'Mirabeau Bas', n: 7, noBoard: true }, { s: 1435, name: 'Portier', n: 8 }, { s: 1740, name: 'Túnel', n: 9, noBoard: true },
  { s: 2089, name: 'Nouvelle Chicane', n: 10 }, { s: 2369, name: 'Tabac', n: 12 }, { s: 2560, name: 'Louis Chiron', n: 13 },
  { s: 2724, name: 'Piscine', n: 15 }, { s: 2919, name: 'La Rascasse', n: 17 }, { s: 3004, name: 'Anthony Noghès', n: 19, noBoard: true }
];
TRACK_DEFS.monaco = {
  id: 'monaco', name: 'Mónaco', title: 'ARMK Racing · Mónaco', mark: 'MON',
  sub: 'Circuit de Monaco · 3,337 km · 19 curvas · el túnel y el puerto',
  raw: () => MONACO_RAW, bar: () => MONACO_BAR, barDs: MONACO_DS, nom: MONACO_NOM, exactW: true, exactStraight: true, wmin: 3.6, noPaint: true, lineMargin: 1.7, passRoom: 1.2, crane: true,   // walls at the asphalt edge: the racing line keeps a wider car (Chiron) off them
  elev: MONACO_ELEV, corners: MONACO_CORNERS, sectors: [1100, 2250], runoff: [],
  kerbs: MONACO_CITY.kerbs, conc: MONACO_CITY.conc, tyres: MONACO_CITY.tyres,
  straight: [3060, 170], pitTr: [],
  pit: [3040, 3090, 160, 160],
  // pit exit: the lane runs on along the right of the straight and comes out on the inside of Sainte-Dévote, up Beau Rivage
  escape: { from: 160, to: 280, rejoin: -0.7, hw: 4.0, pit: true, handles: [0.45, 0.22] },
  pitDepth: 12, tower: false,
  saus: [], startS: 60, boards: [190, 745, 1105, 1250, 1410, 2060, 2340, 2525, 2700, 2895],
  bridges: [], vergeSkip: [0, 1e6], stands: [],
  labels: [[220, 'STE DÉVOTE', 8, 4], [900, 'CASINO', 8, 4], [1270, 'HORQUILLA', 8, 4], [1740, 'TÚNEL', 8, 4], [2089, 'CHICANE', 8, 4], [2369, 'TABAC', 8, 4], [2724, 'PISCINE', 8, 4], [2919, 'RASCASSE', 8, 4]],
  scenery: { monaco: MONACO_CITY, hills: 0, conifer: 0, dens: 9, flat: false, noHills: true },
  load: ['Trazando Mónaco…', 'Montecarlo, el puerto y el túnel…', 'Muros, gradas y boxes…']
};
