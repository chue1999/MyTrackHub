/*
  SQL Server Audit — run on the SQL Server machine (the database is NOT on the
  API server, so the Linux agent cannot see what happens inside SQL Server).

  Records every DELETE, TRUNCATE, DROP and ALTER in the database, and every sign-in (success + failure), with who did it, from which
  machine and the exact SQL text.

  1. Change the folder and the database name below, then run as sysadmin.
  2. Read it:  SELECT event_time, server_principal_name, client_ip,
                      application_name, action_id, succeeded, statement
               FROM sys.fn_get_audit_file('D:\SqlAudit\*.sqlaudit', DEFAULT, DEFAULT)
               ORDER BY event_time DESC;
*/
USE master;
GO
CREATE SERVER AUDIT MyTrackHub_Audit
  TO FILE (FILEPATH = 'D:\SqlAudit\', MAXSIZE = 256 MB, MAX_ROLLOVER_FILES = 50)
  WITH (ON_FAILURE = CONTINUE, QUEUE_DELAY = 1000);
GO
ALTER SERVER AUDIT MyTrackHub_Audit WITH (STATE = ON);
GO
-- Sign-ins + changes to logins, permissions and the audit itself
CREATE SERVER AUDIT SPECIFICATION MyTrackHub_ServerSpec
  FOR SERVER AUDIT MyTrackHub_Audit
  ADD (SUCCESSFUL_LOGIN_GROUP),
  ADD (FAILED_LOGIN_GROUP),
  ADD (SERVER_PRINCIPAL_CHANGE_GROUP),
  ADD (SERVER_ROLE_MEMBER_CHANGE_GROUP),
  ADD (AUDIT_CHANGE_GROUP),
  ADD (DATABASE_CHANGE_GROUP)
  WITH (STATE = ON);
GO

USE [mytplus_tracking];   -- ← your database name
GO
-- Data changes and schema changes inside the database, by anyone
CREATE DATABASE AUDIT SPECIFICATION MyTrackHub_DbSpec
  FOR SERVER AUDIT MyTrackHub_Audit
  ADD (DELETE ON DATABASE::[mytplus_tracking] BY [public]),
  ADD (SCHEMA_OBJECT_CHANGE_GROUP),
  ADD (DATABASE_PRINCIPAL_CHANGE_GROUP),
  ADD (DATABASE_ROLE_MEMBER_CHANGE_GROUP)
  WITH (STATE = ON);
GO
/*
  Only DELETE is recorded on purpose: the API inserts a row for every app event,
  so auditing INSERT/UPDATE would add millions of rows. To also record UPDATE by
  people (not the API), add for example:
    ADD (UPDATE ON DATABASE::[mytplus_tracking] BY [some_person_login])
*/
