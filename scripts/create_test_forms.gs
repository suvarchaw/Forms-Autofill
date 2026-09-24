/**
 * Creates the three Forms Autofill test forms (dummy data only).
 * Run createTestForms, then open View > Executions (or the log) for the links.
 */
function createTestForms() {
  const links = [];

  // 1. Details form: profile fields plus matcher edge cases
  const details = FormApp.create('FA Test 1 - Details');
  details.setDescription('Forms Autofill test form. Dummy data only.');
  ['Full name', 'Email address', 'Phone number', 'College', 'Roll number']
    .forEach(t => details.addTextItem().setTitle(t).setRequired(true));
  details.addTextItem().setTitle("Father's name");         // must be skipped
  details.addTextItem().setTitle('College email');         // must map to email
  details.addTextItem().setTitle('Name of college');       // longest match -> college
  details.addTextItem().setTitle('Username');              // must not match name
  details.addParagraphTextItem().setTitle('Why do you want to join?');
  const year = details.addListItem().setTitle('Year of study').setRequired(true);
  year.setChoiceValues(['1st year', '2nd year', '3rd year', '4th year']);
  const dept = details.addMultipleChoiceItem().setTitle('Department');
  dept.setChoiceValues(['CSE', 'ECE', 'Mechanical']).showOtherOption(true);
  links.push(publish(details));

  // 2. Quiz: all 5 supported types plus 2 unsupported
  const quiz = FormApp.create('FA Test 2 - Quiz');
  quiz.setIsQuiz(true);
  quiz.addTextItem().setTitle('What is the chemical symbol for water?');
  quiz.addParagraphTextItem().setTitle('Explain what a variable is.');
  const mc = quiz.addMultipleChoiceItem().setTitle('What is the capital of France?').setRequired(true);
  mc.setChoices([
    mc.createChoice('Berlin', false), mc.createChoice('Paris', true),
    mc.createChoice('Madrid', false), mc.createChoice('Rome', false),
  ]).setPoints(1);
  const cb = quiz.addCheckboxItem().setTitle('Which of these are prime numbers?');
  cb.setChoices([
    cb.createChoice('2', true), cb.createChoice('3', true),
    cb.createChoice('4', false), cb.createChoice('9', false),
  ]).setPoints(1);
  const dd = quiz.addListItem().setTitle('Which planet is known as the Red Planet?');
  dd.setChoices([
    dd.createChoice('Earth', false), dd.createChoice('Mars', true),
    dd.createChoice('Venus', false), dd.createChoice('Jupiter', false),
  ]).setPoints(1);
  quiz.addScaleItem().setTitle('How confident are you?').setBounds(1, 5);   // unsupported
  quiz.addGridItem().setTitle('Rate these topics')                          // unsupported
    .setRows(['Math', 'Physics']).setColumns(['Easy', 'Medium', 'Hard']);
  links.push(publish(quiz));

  // 3. Multi-page form: two sections
  const multi = FormApp.create('FA Test 3 - Multi-page');
  multi.addTextItem().setTitle('Full name').setRequired(true);
  multi.addTextItem().setTitle('Email address');
  multi.addPageBreakItem().setTitle('Section 2');
  multi.addMultipleChoiceItem().setTitle('Which language runs in the browser?')
    .setChoiceValues(['Python', 'JavaScript', 'C', 'Rust']);
  multi.addTextItem().setTitle('Roll number');
  links.push(publish(multi));

  Logger.log(links.join('\n'));
}

function publish(form) {
  // Newer forms may start unpublished; publish if this Apps Script version supports it.
  if (typeof form.setPublished === 'function') form.setPublished(true);
  return form.getTitle() + ': ' + form.getPublishedUrl();
}
