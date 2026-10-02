"""Question-type labels: label -> (description shown to the C4 router, method note C4 adds)."""

MATH = {
    "linear-equations": ("solve a linear equation or inequality in one variable",
        "Isolate the variable one step at a time; substitute back to check."),
    "systems": ("systems of two linear equations; number of solutions",
        "Use elimination or substitution. For 'no solution' compare slopes with different intercepts; for 'infinitely many' the equations must be multiples."),
    "linear-rate": ("a linear model in context: rate of change, starting value",
        "Write the quantity as start + rate x time. The slope is the change per unit; the intercept is the starting value."),
    "percent-ratio": ("percentages, ratios, proportions, unit conversion",
        "Convert percents to multipliers (up 20% = x1.2, down 20% = x0.8). Chain multipliers; never add percents. Set up ratios as equal fractions."),
    "quadratics": ("quadratic equations, parabolas, polynomial factoring",
        "Factor, complete the square or use the quadratic formula. Discriminant b^2-4ac decides the number of real roots; vertex x = -b/(2a); sum of roots = -b/a, product = c/a."),
    "exponential": ("exponential growth or decay",
        "Growth is a(1+r)^t and decay a(1-r)^t. Match the base to the per-period multiplier and convert the time unit carefully."),
    "functions": ("function notation, evaluation, composition, transformations",
        "Substitute the input exactly. For f(g(x)) work inside out. Read transformations: f(x)+k shifts up, f(x-h) shifts right."),
    "geometry": ("area, volume, angles, triangles, circles",
        "Draw and label the figure. Use angle sums (triangle 180), similar triangles (equal ratios), area/volume formulas, and circle facts: C=2πr, A=πr^2, arc = (angle/360)·C."),
    "trigonometry": ("right-triangle trig, sine/cosine, radians",
        "Label opposite, adjacent and hypotenuse. SOH-CAH-TOA; sin x = cos(90-x); radians = degrees·π/180. Use special right triangles 30-60-90 and 45-45-90."),
    "statistics": ("mean, median, spread, probability, sampling, reading data",
        "Mean = sum/count; median is the middle value after sorting; range = max - min. A sample supports conclusions only about the population it was randomly drawn from."),
}

READING_WRITING = {
    "words-in-context": ("choose the most logical and precise word or phrase",
        "Cover the blank, predict a word from the surrounding clues, then pick the choice closest to the prediction in meaning and tone."),
    "central-idea": ("main idea or main purpose of a text",
        "Find what the whole passage is about, not one detail. Reject choices that are too narrow, too broad or not stated."),
    "evidence-text": ("which quotation or finding supports or weakens a claim",
        "Restate the claim. Pick the quotation or finding that would most directly support (or weaken) exactly that claim."),
    "evidence-quant": ("which choice uses data from a table or graph to complete a claim",
        "Read the claim, then the table or graph axes and units. Pick the choice that is both accurate to the data and relevant to the claim."),
    "inferences": ("which choice most logically completes the text",
        "Pick the completion that follows logically from the text alone. Do not add outside knowledge or overreach."),
    "cross-text": ("how the author of one text would respond to another",
        "Identify each author's position, then how the second author would respond to the first: agree, qualify or reject."),
    "transitions": ("choose the transition word between sentences",
        "Name the relationship between the two sentences (contrast, cause, addition, example, sequence), then pick the word that signals it."),
    "rhetorical-synthesis": ("use the student's notes to accomplish a stated goal",
        "Read the stated goal in the question. Pick the choice that achieves that goal using only the notes; ignore choices that are true but off-goal."),
    "boundaries": ("punctuation between clauses and phrases",
        "Check whether each side is an independent clause. Two independent clauses need a period, semicolon, or comma + conjunction; a colon introduces an explanation or list."),
    "form-structure": ("grammar: agreement, verb tense, modifiers, pronouns",
        "Check subject-verb agreement (find the true subject), pronoun agreement, verb tense consistency and modifier placement."),
}

SECTIONS = {"math": MATH, "rw": READING_WRITING}
