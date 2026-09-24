## v0.1
basically v0.1 parses and detects questions from the google form. like it normalizes the questions. it was also done by taking 3 test google forms. we used aria roles because they are consistent even if the code changes(for screen readers) so it helps with inconsistency. same with data-value
why didn't you save the parser's own output as the expected test answer?
because then the questions will be checked against the .gs script which is the pasers own answers and therefore it will be deemed correct making it prone to errors.
fixtures- we didnt use html bcs that means that if anything changes it will be the code. using a live form means if anything changes then it will be the google form. basically for unknown form layout errror handling
iife- content scripts load as plain scripts therefore the import makes them crash at runtime. so we used vite to split the content script into multiple files joined by imports 
next reloads- we tested window test makrer which came out as undefined. pressing next reloads the entire page so reload wipes the page's memory but past memory will be stored in chrome.storage.session
