// Font loading for the book. Takes the FontFaceSet as a parameter and touches
// no DOM globals, so it runs under node tests. The styles themselves live in
// ./fontStyles (CSS), which only the lazy reader module imports.
export const SERIF = 'Source Serif 4 Variable';
export const MONO = 'Book Mono';

const SAMPLE = 'Слон Elephant ┌─┐';

export async function loadBookFonts(
  fs: number,
  fonts: Pick<FontFaceSet, 'load'>,
  timeoutMs = 3000,
): Promise<{ ok: boolean }> {
  const faces = [
    `400 ${fs}px "${SERIF}"`,
    `600 ${fs}px "${SERIF}"`,
    `italic 400 ${fs}px "${SERIF}"`,
    `400 13px "${MONO}"`,
  ];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: boolean }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), timeoutMs);
  });
  const loaded = Promise.all(faces.map((f) => fonts.load(f, SAMPLE))).then(
    () => ({ ok: true }),
    () => ({ ok: false }),
  );
  try {
    return await Promise.race([loaded, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
