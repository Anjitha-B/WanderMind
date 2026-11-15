import { isValidName, nameError } from './validation';

describe('isValidName', () => {
  it.each([
    'Zoë',
    "O'Brien",
    'O\u2019Brien', // typographic apostrophe
    'José',
    'Nguyễn',
    'Nguye\u0302\u0303n', // the same name with combining marks
    'Mary-Jane',
    'Anna Maria',
    '李小龙',
    'Ólafur',
  ])('accepts %s', (name) => {
    expect(isValidName(name)).toBe(true);
  });

  it.each([
    'J0hn',
    'Anna2',
    '12345',
    'John!',
    'a@b',
    'Jane_Doe',
    'Robert; DROP TABLE',
    '<b>Bob</b>',
    'Smith.',
    'Tab\there',
    '😀',
    '',
    '   ',
    "-'-",
  ])('rejects %j', (name) => {
    expect(isValidName(name)).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(isValidName('  José  ')).toBe(true);
  });
});

describe('nameError', () => {
  it('returns null for an acceptable name', () => {
    expect(nameError('Zoë')).toBeNull();
  });

  it('asks for at least 2 characters', () => {
    expect(nameError('Z')).toMatch(/at least 2 characters/);
    expect(nameError(' Z ')).toMatch(/at least 2 characters/);
  });

  it('counts characters, not UTF-16 units', () => {
    // One character outside the Basic Multilingual Plane has length 2 in JavaScript.
    expect(nameError('𠮷')).toMatch(/at least 2 characters/);
    expect(nameError('𠮷田')).toBeNull();
  });

  it('explains which characters are allowed', () => {
    expect(nameError('J0hn')).toBe(
      'Names can only contain letters, spaces, apostrophes, or hyphens.',
    );
  });
});
