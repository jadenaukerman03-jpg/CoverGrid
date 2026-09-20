# Who can see and change what (row-level security)

These rules live in the database itself, not in the screens, so a leaked front-end
key cannot read records it should not reach. Read straight from the running system.

Shortcuts used in the last column:

- `current_employee_id()` - the staff record attached to the person signed in
- `is_manager(uid)` - true for manager and administrator accounts
- `has_role(uid, 'admin')` - true for administrators only

| Table                   | Rule name                                   | Action     | Condition                                                              |
| ----------------------- | ------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| access_reviews          | access_reviews_select_admins                | read       | has_role(auth.uid(), 'admin'::app_role)                                |
| agencies                | agencies readable by managers               | read       | is_manager(auth.uid())                                                 |
| agencies                | managers manage agencies                    | everything | is_manager(auth.uid())                                                 |
| agency_staff            | agency worker sees own record               | read       | (user_id = auth.uid())                                                 |
| agency_staff            | managers manage agency staff                | everything | is_manager(auth.uid())                                                 |
| app_config              | app config readable by managers             | read       | is_manager(auth.uid())                                                 |
| attendance_events       | managers add attendance                     | add        | is_manager(auth.uid())                                                 |
| attendance_events       | own attendance                              | read       | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
| audit_log               | managers insert audit                       | add        | is_manager(auth.uid())                                                 |
| audit_log               | managers read audit                         | read       | is_manager(auth.uid())                                                 |
| automation_runs         | managers read automation runs               | read       | is_manager(auth.uid())                                                 |
| automation_settings     | automation_settings_select_managers         | read       | is_manager(auth.uid())                                                 |
| call_off_intakes        | employee creates own intake                 | add        | (employee_id = current_employee_id())                                  |
| call_off_intakes        | employee sees own intakes                   | read       | (employee_id = current_employee_id())                                  |
| call_off_intakes        | managers manage intakes                     | everything | is_manager(auth.uid())                                                 |
| census_days             | census managed by managers                  | everything | is_manager(auth.uid())                                                 |
| census_days             | census readable by managers                 | read       | is_manager(auth.uid())                                                 |
| census_imports          | Managers can view census imports            | read       | is_manager(auth.uid())                                                 |
| chat_messages           | delete own chat                             | delete     | (user_id = auth.uid())                                                 |
| chat_messages           | insert own chat                             | add        | (user_id = auth.uid())                                                 |
| chat_messages           | own chat                                    | read       | (user_id = auth.uid())                                                 |
| compliance_items        | Managers manage compliance items            | everything | is_manager(auth.uid())                                                 |
| compliance_items        | Managers read compliance items              | read       | is_manager(auth.uid())                                                 |
| course_completions      | Employees read own completions              | read       | (employee_id = current_employee_id())                                  |
| course_completions      | Managers manage completions                 | everything | is_manager(auth.uid())                                                 |
| employee_credentials    | employee sees own credentials               | read       | (employee_id = current_employee_id())                                  |
| employee_credentials    | managers manage credentials                 | everything | is_manager(auth.uid())                                                 |
| employee_notes          | Employees read notes about themselves       | read       | (employee_id = current_employee_id())                                  |
| employee_notes          | Managers manage employee notes              | everything | is_manager(auth.uid())                                                 |
| employees               | employees read self or manager              | read       | ((user_id = auth.uid()) OR (id = current_employee_id()) OR is_manager( |
| employees               | managers update employees                   | edit       | is_manager(auth.uid())                                                 |
| facilities              | facilities readable                         | read       | true                                                                   |
| facilities              | managers manage facilities                  | everything | is_manager(auth.uid())                                                 |
| float_events            | Managers can record floats                  | add        | is_manager(auth.uid())                                                 |
| float_events            | float history self or manager               | read       | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
| hire_documents          | Employees read own documents                | read       | (employee_id = current_employee_id())                                  |
| hire_documents          | Managers manage hire documents              | everything | is_manager(auth.uid())                                                 |
| import_batches          | Managers manage import batches              | everything | is_manager(auth.uid())                                                 |
| inservice_courses       | Managers manage courses                     | everything | is_manager(auth.uid())                                                 |
| inservice_courses       | Staff read active courses                   | read       | is_active                                                              |
| integration_connections | Managers manage integrations                | everything | is_manager(auth.uid())                                                 |
| integration_connections | Managers view integrations                  | read       | is_manager(auth.uid())                                                 |
| integration_incidents   | Managers manage incidents                   | everything | is_manager(auth.uid())                                                 |
| integration_incidents   | Managers view incidents                     | read       | is_manager(auth.uid())                                                 |
| integration_snapshots   | Managers view snapshots                     | read       | is_manager(auth.uid())                                                 |
| integration_syncs       | Managers view syncs                         | read       | is_manager(auth.uid())                                                 |
| job_applicants          | applicants manager only                     | everything | is_manager(auth.uid())                                                 |
| job_postings            | postings managed by managers                | everything | is_manager(auth.uid())                                                 |
| job_postings            | postings readable                           | read       | true                                                                   |
| login_attempts          | login_attempts_select_admins                | read       | has_role(auth.uid(), 'admin'::app_role)                                |
| marketplace_offers      | Managers manage marketplace offers          | everything | is_manager(auth.uid())                                                 |
| marketplace_workers     | Managers manage marketplace workers         | everything | is_manager(auth.uid())                                                 |
| message_outbox          | Managers read outbox                        | read       | is_manager(auth.uid())                                                 |
| messages                | messages insert                             | add        | ((sender_id = current_employee_id()) OR is_manager(auth.uid()))        |
| messages                | messages readable                           | read       | ((recipient_id IS NULL) OR (recipient_id = current_employee_id()) OR ( |
| messages                | messages update own                         | edit       | ((recipient_id = current_employee_id()) OR is_manager(auth.uid()))     |
| new_hires               | Managers manage new hires                   | everything | is_manager(auth.uid())                                                 |
| notification_attempts   | Managers log delivery attempts              | add        | is_manager(auth.uid())                                                 |
| notification_attempts   | Managers read all delivery attempts         | read       | (is_manager(auth.uid()) OR (employee_id = current_employee_id()))      |
| notification_rules      | Managers manage all notification rules      | everything | is_manager(auth.uid())                                                 |
| notification_rules      | People change their own notification rules  | edit       | ((scope = 'employee'::text) AND (employee_id = current_employee_id())) |
| notification_rules      | People create their own notification rules  | add        | ((scope = 'employee'::text) AND (employee_id = current_employee_id())) |
| notification_rules      | People read their own notification rules    | read       | ((employee_id = current_employee_id()) OR ((scope = 'role'::text) AND  |
| notifications           | own notifications                           | read       | ((employee_id = current_employee_id()) OR ((audience = 'manager'::text |
| notifications           | update own notifications                    | edit       | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
| onboarding_phase_status | Managers read onboarding phase corrections  | read       | is_manager(auth.uid())                                                 |
| onboarding_phase_status | Managers write onboarding phase corrections | everything | is_manager(auth.uid())                                                 |
| payroll_periods         | payroll manager only                        | everything | is_manager(auth.uid())                                                 |
| point_buybacks          | Employees see their own buybacks            | read       | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
| point_buybacks          | Managers record buybacks                    | add        | is_manager(auth.uid())                                                 |
| profiles                | own profile                                 | read       | ((id = auth.uid()) OR is_manager(auth.uid()))                          |
| profiles                | update own profile                          | edit       | (id = auth.uid())                                                      |
| pto_requests            | managers decide pto                         | edit       | is_manager(auth.uid())                                                 |
| pto_requests            | own pto                                     | read       | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
| pto_requests            | submit own pto                              | add        | (employee_id = current_employee_id())                                  |
| punch_devices           | Managers read clocks                        | read       | is_manager(auth.uid())                                                 |
| recognitions            | recognitions insert                         | add        | ((from_employee_id = current_employee_id()) OR is_manager(auth.uid())) |
| recognitions            | recognitions_select_involved                | read       | (is_manager(auth.uid()) OR (employee_id = current_employee_id()) OR (f |
| reward_ledger           | reward own or manager                       | read       | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
| schedule_templates      | templates manager only                      | everything | is_manager(auth.uid())                                                 |
| screening_checks        | Managers manage screening checks            | everything | is_manager(auth.uid())                                                 |
| security_incidents      | Administrators read security incidents      | read       | has_role(auth.uid(), 'admin'::app_role)                                |
| security_incidents      | Administrators update security incidents    | edit       | has_role(auth.uid(), 'admin'::app_role)                                |
| security_incidents      | Administrators write security incidents     | add        | has_role(auth.uid(), 'admin'::app_role)                                |
| setup_steps             | Managers manage setup steps                 | everything | is_manager(auth.uid())                                                 |
| shift_assignments       | managers delete schedule                    | delete     | is_manager(auth.uid())                                                 |
| shift_assignments       | managers modify schedule                    | edit       | is_manager(auth.uid())                                                 |
| shift_assignments       | managers write schedule                     | add        | is_manager(auth.uid())                                                 |
| shift_assignments       | schedule read own or manager                | read       | ((employee_id = current_employee_id()) OR (employee_id IS NULL) OR is_ |
| shift_claim_offers      | Employees see their own claim offers        | read       | (employee_id = current_employee_id())                                  |
| shift_claim_offers      | Managers manage claim offers                | everything | is_manager(auth.uid())                                                 |
| shift_switches          | create own switch                           | add        | ((requester_id = current_employee_id()) OR is_manager(auth.uid()))     |
| shift_switches          | involved switches                           | read       | ((requester_id = current_employee_id()) OR (covering_id = current_empl |
| shift_switches          | update involved switch                      | edit       | ((covering_id = current_employee_id()) OR is_manager(auth.uid()))      |
| staffing_alerts         | managers read alerts                        | read       | is_manager(auth.uid())                                                 |
| staffing_alerts         | managers update alerts                      | edit       | is_manager(auth.uid())                                                 |
| staffing_alerts         | managers write alerts                       | add        | is_manager(auth.uid())                                                 |
| staffing_requirements   | requirements read manager                   | read       | is_manager(auth.uid())                                                 |
| time_punches            | punches insert own or manager               | add        | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
| time_punches            | punches own or manager                      | read       | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
| time_punches            | punches update own or manager               | edit       | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
| units                   | read units                                  | read       | true                                                                   |
| user_roles              | read own roles                              | read       | ((user_id = auth.uid()) OR is_manager(auth.uid()))                     |
| wage_advances           | advances insert own pending                 | add        | ((employee_id = current_employee_id()) AND (status = 'pending'::text)  |
| wage_advances           | advances managers decide                    | edit       | is_manager(auth.uid())                                                 |
| wage_advances           | advances own or manager                     | read       | ((employee_id = current_employee_id()) OR is_manager(auth.uid()))      |
