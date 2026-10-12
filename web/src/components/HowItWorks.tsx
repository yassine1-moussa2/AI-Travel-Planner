// What the site does, in three steps. A real sequence, so the steps are numbered.
// The dotted line between the numbers echoes the walking route on the day maps.

interface Step {
  title: string;
  text: string;
}

const STEPS: Step[] = [
  { title: "Tell us the trip.", text: "Who's going, where, for how long, and roughly what you can spend." },
  {
    title: "We build the days from real places.",
    text: "Cafés, sights and restaurants that exist, arranged so you're not crossing town all day.",
  },
  { title: "Make it yours.", text: "Move, swap or drop anything. Times and the budget update as you go." },
];

export default function HowItWorks() {
  const items = [];
  for (let index = 0; index < STEPS.length; index++) {
    const step = STEPS[index];
    items.push(
      <li key={step.title} className="how-step">
        <span className="how-number" aria-hidden="true">
          {index + 1}
        </span>
        <p>
          <strong>{step.title}</strong> {step.text}
        </p>
      </li>,
    );
  }

  return (
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol className="how-steps">{items}</ol>
      <p className="how-promise">Every place is real. Every price is an estimate you can change.</p>
    </section>
  );
}
