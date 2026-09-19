-- ==========================================================================
-- Saúde+ — Migração 001: separação de tipos de usuário + perfil estendido
-- Execute APENAS se já tinha um banco instalado de uma versão anterior.
-- Se estiver instalando do zero, basta rodar schema.sql.
-- ==========================================================================
-- Uso:
--   mysql --default-character-set=utf8mb4 -u root -p saude < server/migration_001.sql
-- ==========================================================================

SET NAMES utf8mb4;

USE saude;

-- 1. Adiciona novas colunas (IF NOT EXISTS garante idempotência no MySQL 8+)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS mobile VARCHAR(30) NULL AFTER phone,
ADD COLUMN IF NOT EXISTS cpf VARCHAR(14) NULL AFTER mobile,
ADD COLUMN IF NOT EXISTS rg VARCHAR(15) NULL AFTER cpf,
ADD COLUMN IF NOT EXISTS birth_date DATE NULL AFTER rg,
ADD COLUMN IF NOT EXISTS gender ENUM(
    'masculino',
    'feminino',
    'outro',
    'prefiro_nao_informar'
) NULL AFTER birth_date,
ADD COLUMN IF NOT EXISTS blood_type ENUM(
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-'
) NULL AFTER gender,
ADD COLUMN IF NOT EXISTS mother_name VARCHAR(150) NULL AFTER blood_type,
ADD COLUMN IF NOT EXISTS father_name VARCHAR(150) NULL AFTER mother_name,
ADD COLUMN IF NOT EXISTS cep VARCHAR(9) NULL AFTER father_name,
ADD COLUMN IF NOT EXISTS street VARCHAR(180) NULL AFTER cep,
ADD COLUMN IF NOT EXISTS address_number VARCHAR(10) NULL AFTER street,
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100) NULL AFTER address_number,
ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL AFTER neighborhood,
ADD COLUMN IF NOT EXISTS state CHAR(2) NULL AFTER city,
ADD COLUMN IF NOT EXISTS zone ENUM('urbana', 'rural') NULL AFTER state,
ADD COLUMN IF NOT EXISTS reference_point VARCHAR(255) NULL AFTER zone,
ADD COLUMN IF NOT EXISTS job_role VARCHAR(100) NULL AFTER reference_point,
ADD COLUMN IF NOT EXISTS account_status ENUM(
    'ativo',
    'inativo',
    'pendente'
) NOT NULL DEFAULT 'ativo' AFTER job_role;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL AFTER created_at;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS admin_level ENUM(
    'superadmin',
    'gestor',
    'atendimento',
    'alertas'
) NULL AFTER role;

UPDATE users
SET
    admin_level = 'gestor'
WHERE
    role = 'admin'
    AND admin_level IS NULL;

-- 2. Migra role='user' para 'paciente' (valor antigo que não existe mais no novo enum)
UPDATE users SET role = 'paciente' WHERE role = 'user';

-- 3. Expande o enum de role para incluir 'atendente'
--    (só funciona depois do UPDATE acima, pois 'user' não pode existir no novo enum)
ALTER TABLE users
MODIFY COLUMN role ENUM(
    'paciente',
    'atendente',
    'admin'
) NOT NULL DEFAULT 'paciente';

SELECT CONCAT(
        COUNT(*), ' usuários migrados: ', SUM(role = 'paciente'), ' pacientes, ', SUM(role = 'atendente'), ' atendentes, ', SUM(role = 'admin'), ' admins.'
    ) AS resultado
FROM users;

-- 4. Permite desativar unidades sem apagar o histórico de configuração.
ALTER TABLE health_units
ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1 AFTER neighborhood;