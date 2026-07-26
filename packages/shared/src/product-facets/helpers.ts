export type AddTag = (key: string, value: string) => void;
export type MatchRule = readonly [value: string, pattern: RegExp];

export function extractFormFactors(text: string, add: AddTag, key: string): void {
  addAllMatches(add, key, text, [
    ["e-atx", /(?:^|[(/,\s])E-?ATX(?=$|[^A-Z0-9-])/],
    ["atx", /(?:^|[(/,\s])ATX(?=$|[^A-Z0-9-])/],
    ["m-atx", /(?:^|[(/,\s])(?:M-?ATX|MICRO\s*ATX)(?=$|[^A-Z0-9-])/],
    ["mini-itx", /(?:^|[^A-Z0-9])(?:MINI-?ITX|ITX)(?=$|[^A-Z0-9])/],
    ["ceb", /(?:^|[(/,\s])CEB(?=$|[^A-Z0-9-])/],
    ["eeb", /(?:^|[(/,\s])EEB(?=$|[^A-Z0-9-])/],
  ]);
}

export function addAllMatches(
  add: AddTag,
  key: string,
  text: string,
  rules: readonly MatchRule[],
): void {
  for (const [value, pattern] of rules) {
    if (pattern.test(text)) {
      add(key, value);
    }
  }
}

export function addFirstMatch(
  add: AddTag,
  key: string,
  text: string,
  rules: readonly MatchRule[],
): void {
  for (const [value, pattern] of rules) {
    if (pattern.test(text)) {
      add(key, value);
      return;
    }
  }
}

export function addFirstNumberMatch(add: AddTag, key: string, text: string, pattern: RegExp): void {
  const match = text.match(pattern);
  if (match?.[1]) {
    add(key, match[1]);
  }
}
