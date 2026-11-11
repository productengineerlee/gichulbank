export type UserRole = "student" | "admin";
export type ExamStatus = "draft" | "published" | "archived";
export type ExamKind = "classification" | "regression" | "mixed" | "quiz";
export type QuestionType = "single_choice" | "integer" | "decimal" | "percentage" | "unit_value" | "text";
export type GradingType = "exact" | "rounded" | "absolute_tolerance" | "relative_tolerance" | "multiple_answers";
export type AttemptStatus = "in_progress" | "submitted" | "expired" | "graded";

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      profiles: Table<{ id: string; birth_date: string; role: UserRole; display_name: string | null; created_at: string; updated_at: string }>;
      user_consents: Table<{ id: number; user_id: string; consent_type: string; version: string; accepted: boolean; accepted_at: string }>;
      exams: Table<{ id: string; slug: string; title: string; description: string | null; kind: ExamKind; status: ExamStatus; duration_minutes: number; passing_score: number; total_score: number; fixed_order: boolean; certification_id: string | null; published_at: string | null; created_by: string | null; created_at: string; updated_at: string }>;
      exam_sections: Table<{ id: string; exam_id: string; code: string; title: string; description: string | null; max_score: number; min_score: number | null; sort_order: number }>;
      questions: Table<{ id: string; exam_id: string; section_id: string; number: number; type: QuestionType; prompt: string; instructions: string | null; image_url: string | null; score: number; difficulty: number; competency_tags: string[]; prerequisite_question_id: string | null; answer_format_hint: string | null; explanation: string | null; is_active: boolean; created_at: string; updated_at: string }>;
      question_choices: Table<{ id: string; question_id: string; label: string; content: string; sort_order: number }>;
      answer_keys: Table<{ question_id: string; grading_type: GradingType; correct_choice_id: string | null; correct_value: string | null; accepted_values: string[]; decimal_places: number | null; tolerance: number | null; case_sensitive: boolean; explanation: string | null; updated_at: string }>;
      exam_assets: Table<{ id: string; exam_id: string; asset_type: string; title: string; bucket_id: string; object_path: string; is_downloadable: boolean; sort_order: number; created_at: string }>;
      attempts: Table<{ id: string; exam_id: string; user_id: string; status: AttemptStatus; started_at: string; expires_at: string; submitted_at: string | null; graded_at: string | null; total_score: number | null; correct_count: number | null; answered_count: number; passed: boolean | null; created_at: string; updated_at: string }>;
      attempt_answers: Table<{ id: string; attempt_id: string; question_id: string; selected_choice_id: string | null; answer_text: string | null; is_flagged: boolean; is_correct: boolean | null; awarded_score: number | null; answered_at: string; graded_at: string | null }>;
      section_results: Table<{ id: string; attempt_id: string; section_id: string; earned_score: number; max_score: number; correct_count: number; question_count: number; percentage: number }>;
      diagnostic_rules: Table<{ id: string; section_code: string | null; competency_tag: string | null; min_percentage: number; max_percentage: number; level: string; comment: string; recommendation: string | null; priority: number; is_active: boolean }>;
      theory_content: Table<{ id: string; section_code: string; competency_tag: string | null; title: string; body: string; sort_order: number; is_active: boolean; created_at: string; updated_at: string }>;
      certifications: Table<{ id: string; code: string; name: string; description: string | null; is_active: boolean; sort_order: number; created_at: string }>;
      certification_schedules: Table<{ id: string; certification_id: string; round_name: string; exam_date: string | null; apply_start: string | null; apply_end: string | null; notes: string | null; memo: string | null; sort_order: number; created_at: string }>;
      question_stat_seed: Table<{ question_id: string; attempt_count: number; correct_count: number }>;
      qna_posts: Table<{ id: string; user_id: string; certification_id: string | null; title: string; content: string; is_active: boolean; created_at: string; updated_at: string }>;
      qna_comments: Table<{ id: string; post_id: string; user_id: string; content: string; is_active: boolean; created_at: string; updated_at: string }>;
      exam_reviews: Table<{ id: string; user_id: string; certification_id: string; exam_id: string; attempt_id: string | null; rating: number; comment: string | null; is_hidden: boolean; created_at: string; updated_at: string }>;
      review_items: Table<{ user_id: string; question_id: string; wrong_count: number; correct_streak: number; last_wrong_at: string; next_review_at: string; graduated_at: string | null; created_at: string; updated_at: string }>;
      practice_answers: Table<{ id: string; user_id: string; question_id: string; selected_label: string; is_correct: boolean; time_spent_ms: number | null; mode: "review" | "daily" | "random"; answered_at: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      record_wrong_answers: { Args: { p_user_id: string; p_question_ids: string[]; p_wrong_at?: string }; Returns: undefined };
    };
    Enums: { user_role: UserRole; exam_status: ExamStatus; exam_kind: ExamKind; question_type: QuestionType; grading_type: GradingType; attempt_status: AttemptStatus };
    CompositeTypes: Record<string, never>;
  };
}
