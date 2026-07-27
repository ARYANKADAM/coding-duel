function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateQuestion() {
  const ops = ["+", "-", "*", "/"];
  const op = ops[randInt(0, 3)];
  let a, b, answer;

  switch (op) {
    case "+":
      a = randInt(1, 50);
      b = randInt(1, 50);
      answer = a + b;
      break;
    case "-":
      a = randInt(1, 50);
      b = randInt(1, a); // avoid negative results
      answer = a - b;
      break;
    case "*":
      a = randInt(2, 12);
      b = randInt(2, 12);
      answer = a * b;
      break;
    case "/":
      b = randInt(2, 12);
      answer = randInt(2, 12);
      a = b * answer; // guarantees clean division
      break;
  }

  return { prompt: `${a} ${op === "*" ? "×" : op} ${b}`, answer: String(answer) };
}