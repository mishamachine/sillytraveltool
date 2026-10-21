// Demo-mode response for generate-checklist: an array of { title, items: [{ label, note }] }.
export default function checklistFixture(body) {
  const city = body?.trip?.destination_city || 'your trip'
  return [
    { title: 'Essentials', items: [
      { label: 'Passport', note: 'valid 6+ months beyond your return' },
      { label: 'Plug adapter · Type F', note: `${city} uses European plugs` },
      { label: 'Alhambra tickets on your phone', note: 'timed entry, ID checked at the gate' },
    ] },
    { title: 'Clothes', items: [
      { label: 'Light jacket for evenings', note: 'cool after sunset' },
      { label: 'Walking shoes, broken in', note: 'lots of hills and cobbles' },
      { label: 'Covered shoulders for cathedrals', note: null },
    ] },
    { title: 'Toiletries', items: [
      { label: 'Sunscreen', note: 'strong sun even in spring' },
      { label: 'Medications', note: 'plus a few spare days' },
    ] },
  ]
}
