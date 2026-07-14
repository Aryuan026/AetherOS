import { CharacterProfile, QuizQuestion, StudyChapter, StudyCourse, UserProfile } from '../types';

export const buildCurriculumPrompt = (title: string, sampleText: string, preference: string) => `
### Task: Create Course Outline
Document Title: "${title}"
User Preference: "${preference || 'Standard'}"
Content Sample:
${sampleText.substring(0, 5000)}...

Please analyze the content and split it into 3-8 logical chapters for teaching.
For each chapter, provide a title, a brief summary of what it covers, and a difficulty rating.

### Output Format (Strict JSON)
{
  "chapters": [
    { "title": "Chapter 1: ...", "summary": "...", "difficulty": "easy" }
  ]
}
`;

export const appendStudyModeContext = (
    coreContext: string,
    userProfile: UserProfile
) => `${coreContext}

### [System: Study Mode Active]
You are now acting as a private tutor for ${userProfile.name}.
- **Maintain Personality**: You MUST stay in character (as defined above). If you are tsundere, teach with a tsundere attitude. If you are shy, teach shyly. Don't become a robotic lecturer.
- **Goal**: Explain the content clearly, but don't lose your "soul".
- **Safety**: If the source material contains sensitive topics (biology, history, etc.), treat them academically and neutrally.
`;

export const buildLecturePrompt = (
    personaContext: string,
    course: StudyCourse,
    chapter: StudyChapter,
    sourceText: string
) => `${personaContext}

### [Current Lesson Configuration]
Topic: "${chapter.title}"
Difficulty: ${chapter.difficulty}
User Preference: "${course.preference || 'Standard'}"

### [Source Material]
${sourceText.substring(0, 8000)}

### [Task: Lecture Generation]
Explain this chapter's key concepts to the user based strictly on the Source Material above.
- **Formatting**: Use Markdown extensively.
  - **Bold** for key terms (\`**term**\`).
  - Lists for steps.
  - Math: Use \`$ E=mc^2 $\` for inline math, and \`$$ E=mc^2 $$\` for block equations.
- **Style**: ${course.preference || 'Simple, conversational, and encouraging.'}
- **Structure**:
  1. Intro: Friendly greeting.
  2. Core: Explanation of concepts using analogies.
  3. Example: A concrete example or walkthrough.
  4. Summary: Quick recap.
`;

export const appendStudyQuestionContext = (
    coreContext: string
) => `${coreContext}

### [System: Study Mode Q&A]
User is asking a question about the study material.
- **Maintain Personality**: Answer in character.
`;

export const buildStudyQuestionPrompt = (
    personaContext: string,
    sourceText: string,
    question: string
) => `${personaContext}
### Source Material
${sourceText.substring(0, 8000)}

### User Question
"${question}"

### Task
Answer the question based on the source material. Be helpful and encouraging (in character). Use Markdown.
`;

export const buildStudyMemoryPrompt = (
    selectedChar: CharacterProfile,
    userProfile: UserProfile,
    chapterTitle: string
) => `
[System: Memory Generation]
Role: ${selectedChar.name} (Teacher)
Action: Just finished teaching "${chapterTitle}" to ${userProfile.name}.
Task: Write a short, **first-person** diary entry (1 sentence) about this teaching session.
Format: "今天给[User]讲了[Topic]..." or "Today I taught [User] about..."
Note: Use "我" (I) to refer to yourself.
`;

export const buildQuizPrompt = (
    chapter: StudyChapter,
    sourceText: string,
    quizCount: number,
    selectedTypeText: string
) => `### Task: Generate Quiz Questions
You are creating a quiz based on the following study material.

**Chapter**: "${chapter.title}"
**Source Material**:
${sourceText.substring(0, 10000)}

**Requirements**:
- Generate exactly ${quizCount} questions total
- Question types to include: ${selectedTypeText}
- Mix the types roughly evenly among the selected types
- Questions should test understanding, not just memorization
- For choice questions: provide exactly 4 options labeled A/B/C/D
- For true_false questions: answer should be "true" or "false"
- For fill_blank questions: use "___" in the stem to indicate the blank, answer should be concise (1-5 words)
- Provide a brief explanation for each answer

### Output Format (Strict JSON, no markdown wrapping)
{
  "questions": [
    {
      "type": "choice",
      "stem": "Which of the following...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "B",
      "explanation": "Because..."
    }
  ]
}`;

export const buildQuizReviewPrompt = (
    coreContext: string,
    userProfile: UserProfile,
    session: { chapterTitle: string },
    score: number,
    total: number,
    scorePercent: number,
    resultsText: string
) => `${coreContext}

### [System: Quiz Review Mode]
You just gave ${userProfile.name} a quiz on "${session.chapterTitle}".
They scored ${score}/${total} (${scorePercent}%).

**Your task**: Review their answers one by one. For each question:
- If they got it RIGHT: give a brief, entertaining acknowledgment (can be surprised, sarcastic, or genuinely happy depending on your personality)
- If they got it WRONG: analyze WHY they might have gotten it wrong. Did they confuse similar concepts? Did they not read carefully? Make it entertaining and memorable — the goal is to make them laugh while learning. Ask them rhetorically what went wrong.
- Stay in character throughout! A gentle character should be funny in a gentle way. A tsundere should be tsundere about it. A cool character should be cool about it.
- The tone should be engaging and memorable — think "entertaining study buddy", not "cold grading machine"
- Use their name naturally

**Important**:
- Review ALL questions in one response
- Use markdown formatting
- Number each review to match the question number
- End with an overall summary comment about their performance

### Quiz Results:
${resultsText}

### Your Review (in character):`;

export const buildQuizFollowUpPrompt = (
    coreContext: string,
    question: QuizQuestion,
    userQuestion: string
) => `${coreContext}

### [System: Quiz Follow-up Q&A]
The user just did a quiz and wants to ask about a specific question they got ${question.isCorrect ? 'right' : 'wrong'}.

**Question**: ${question.stem}
${question.options ? question.options.map(o => `  ${o}`).join('\n') : ''}
**Correct Answer**: ${question.answer}
**User's Answer**: ${question.userAnswer || '(未作答)'}
**Explanation**: ${question.explanation}

**User's follow-up question**: "${userQuestion}"

Answer in character. Be helpful and clear. If they're confused about a concept, explain it with different examples or analogies. Keep it concise but thorough.`;
