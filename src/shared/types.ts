export type QuestionType =
  | 'short_answer'
  | 'paragraph'
  | 'multiple_choice'
  | 'checkboxes'
  | 'dropdown'
  | 'unsupported';

export type Question = {
  text: string;
  type: QuestionType;
  options: string[];
  required: boolean;
};
