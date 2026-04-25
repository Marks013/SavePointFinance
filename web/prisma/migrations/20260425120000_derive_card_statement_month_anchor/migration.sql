UPDATE "Card"
SET "statementMonthAnchor" = CASE
  WHEN "closeDay" < "dueDay" THEN 'previous_month'::"StatementMonthAnchor"
  ELSE 'close_month'::"StatementMonthAnchor"
END;
