/** Strict, composable catalogue facets. Names are a fallback where the LibriVox
 * section feed and the general catalogue use different identifier namespaces. */
export function normalizePersonName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function samePerson(candidate, selected, idField = 'id', nameField = 'name') {
  if (!candidate || !selected) return false;
  const id = candidate[idField];
  if (selected.id != null && id != null && String(selected.id) === String(id)) return true;
  const candidateName = normalizePersonName(candidate[nameField]);
  const selectedName = normalizePersonName(selected.name);
  return Boolean(candidateName && selectedName && candidateName === selectedName);
}
export function workHasAuthor(work, author) {
  return !author || (work?.authors || []).some(a => samePerson(a, author));
}
export function recordingHasReader(recording, reader) {
  return !reader || (recording?.narrators || []).some(n => samePerson(n, reader));
}
export function sectionHasReader(section, reader) {
  return !reader || (section?.readers || []).some(r => {
    if (reader.librivoxId != null && r.reader_id != null && String(r.reader_id) === String(reader.librivoxId)) return true;
    return samePerson(r, reader, 'reader_id', 'display_name');
  });
}
export function filteredSections(sections, reader) {
  return (sections || []).filter(s => sectionHasReader(s, reader));
}
export function matchingReaderCredits(credits, author, reader) {
  return (credits || []).filter(c => c?.work?.id && c?.recording?.id &&
    workHasAuthor(c.work, author) && recordingHasReader(c.recording, reader));
}
export function selectLibriVoxEditions(work, reader = null, allowedRecordingIds = null) {
  const allowed = allowedRecordingIds ? new Set(allowedRecordingIds.map(String)) : null;
  return (work?.recordings || []).filter(r => Number(r.librivox_id) > 0 &&
    (!allowed || allowed.has(String(r.id))) && recordingHasReader(r, reader));
}