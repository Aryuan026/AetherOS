const text = value => String(value || '').replace(/\s+/g, ' ').trim();
const normalizedComparable = value => text(value).replace(/[，。！？、；：“”‘’（）()【】\-—]/g, '');

const longestSharedRun = (left, right) => {
  const short = left.length <= right.length ? left : right;
  const long = left.length <= right.length ? right : left;
  let longest = 0;
  for (let start = 0; start < short.length; start += 1) {
    for (let end = start + 1; end <= short.length; end += 1) {
      if (end - start <= longest) continue;
      if (long.includes(short.slice(start, end))) longest = end - start;
    }
  }
  return longest;
};

const bigramSet = value => {
  const result = new Set();
  for (let index = 0; index < value.length - 1; index += 1) result.add(value.slice(index, index + 2));
  return result;
};

// Candidate guidance is an intake hypothesis, never a source of semantic
// authority. This catches both direct copying and a near-identical rewrite
// before a later reviewer mistakes a model's draft for fresh extraction.
export const measureCandidateGuidanceEchoRisk = (guidance, candidateGuidance) => {
  const left = normalizedComparable(guidance);
  const right = normalizedComparable(candidateGuidance);
  if (left.length < 8 || right.length < 8) {
    return { risk: 'low', longestSharedRun: 0, bigramDice: 0 };
  }
  const leftBigrams = bigramSet(left);
  const rightBigrams = bigramSet(right);
  const intersection = [...leftBigrams].filter(token => rightBigrams.has(token)).length;
  const bigramDice = Number(((2 * intersection) / (leftBigrams.size + rightBigrams.size)).toFixed(3));
  const sharedRun = longestSharedRun(left, right);
  const sharedFraction = sharedRun / Math.min(left.length, right.length);
  const risk = (sharedRun >= 14 && sharedFraction >= 0.4) || bigramDice >= 0.72
    ? 'high'
    : (sharedRun >= 9 && sharedFraction >= 0.3) || bigramDice >= 0.52
      ? 'medium'
      : 'low';
  return { risk, longestSharedRun: sharedRun, bigramDice };
};
