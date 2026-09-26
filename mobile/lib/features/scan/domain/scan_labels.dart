import '../../../l10n/generated/app_localizations.dart';

/// The label catalog, mirroring `backend/src/modules/vision/schema.ts`.
///
/// Duplicated deliberately rather than fetched: the client needs the list to offer a
/// correction, and the server refuses anything outside it. If the two drift, the drift
/// shows up as a refused confirmation rather than as a silently invented label.
const List<String> candidateDeityLabels = <String>[
  'ganesh',
  'shiva',
  'shivling',
  'hanuman',
  'krishna',
  'radha_krishna',
  'ram',
  'sita',
  'lakshman',
  'ram_darbar',
  'lakshmi',
  'saraswati',
  'durga',
  'kali',
  'parvati',
  'kartikeya',
  'vishnu',
  'narasimha',
  'shani',
  'surya',
  'navagraha',
  'other_deity',
  'unknown_idol',
];

const List<String> candidateObjectLabels = <String>[
  'diya',
  'incense_holder',
  'incense_sticks',
  'bell',
  'shankh',
  'kalash',
  'coconut',
  'mala',
  'flowers',
  'puja_thali',
  'water_vessel',
  'religious_book',
  'yantra',
  'photo_frame',
  'oil_lamp',
  'camphor_holder',
  'rudraksha',
  'decorative_object',
  'other_object',
  'unknown',
];

const List<String> allCandidateLabels = <String>[
  ...candidateDeityLabels,
  ...candidateObjectLabels,
];

/// The catalog order, with the deities first: a correction list is read more often for a
/// deity than for a lamp.
List<String> labelsForCategory(String category) => switch (category) {
  'deity_representation' => candidateDeityLabels,
  _ => candidateObjectLabels,
};

/// What the user should read. Falls back to the raw id rather than to a guess, so an
/// unknown label is visibly unknown instead of being silently prettified.
String labelDisplayName(AppLocalizations l10n, String label) => switch (label) {
  'ganesh' => l10n.labelGanesh,
  'shiva' => l10n.labelShiva,
  'shivling' => l10n.labelShivling,
  'hanuman' => l10n.labelHanuman,
  'krishna' => l10n.labelKrishna,
  'radha_krishna' => l10n.labelRadhaKrishna,
  'ram' => l10n.labelRam,
  'sita' => l10n.labelSita,
  'lakshman' => l10n.labelLakshman,
  'ram_darbar' => l10n.labelRamDarbar,
  'lakshmi' => l10n.labelLakshmi,
  'saraswati' => l10n.labelSaraswati,
  'durga' => l10n.labelDurga,
  'kali' => l10n.labelKali,
  'parvati' => l10n.labelParvati,
  'kartikeya' => l10n.labelKartikeya,
  'vishnu' => l10n.labelVishnu,
  'narasimha' => l10n.labelNarasimha,
  'shani' => l10n.labelShani,
  'surya' => l10n.labelSurya,
  'navagraha' => l10n.labelNavagraha,
  'other_deity' => l10n.labelOtherDeity,
  'unknown_idol' => l10n.labelUnknownIdol,
  'diya' => l10n.labelDiya,
  'incense_holder' => l10n.labelIncenseHolder,
  'incense_sticks' => l10n.labelIncenseSticks,
  'bell' => l10n.labelBell,
  'shankh' => l10n.labelShankh,
  'kalash' => l10n.labelKalash,
  'coconut' => l10n.labelCoconut,
  'mala' => l10n.labelMala,
  'flowers' => l10n.labelFlowers,
  'puja_thali' => l10n.labelPujaThali,
  'water_vessel' => l10n.labelWaterVessel,
  'religious_book' => l10n.labelReligiousBook,
  'yantra' => l10n.labelYantra,
  'photo_frame' => l10n.labelPhotoFrame,
  'oil_lamp' => l10n.labelOilLamp,
  'camphor_holder' => l10n.labelCamphorHolder,
  'rudraksha' => l10n.labelRudraksha,
  'decorative_object' => l10n.labelDecorativeObject,
  'other_object' => l10n.labelOtherObject,
  'unknown' => l10n.labelUnknown,
  _ => label,
};

/// How the object is represented, which matters for the duplicate rules (PRD section 13).
String representationDisplayName(
  AppLocalizations l10n,
  String representation,
) => switch (representation) {
  'statue' => l10n.representationStatue,
  'framed_image' => l10n.representationFramedImage,
  'poster' => l10n.representationPoster,
  'printed_image' => l10n.representationPrintedImage,
  'relief' => l10n.representationRelief,
  'shivling' => l10n.representationShivling,
  'physical_object' => l10n.representationPhysicalObject,
  _ => l10n.representationUnknown,
};
