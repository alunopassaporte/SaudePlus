-- ==========================================================================
-- Saúde+ — schema MySQL
-- Rode: mysql -u root -p < schema.sql
-- (ou copie/cole no MySQL Workbench / DBeaver)
-- ==========================================================================

CREATE DATABASE IF NOT EXISTS saude CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE saude;

-- Garante charset correto na sessão do cliente MySQL (evita dados corrompidos
-- quando o terminal/cliente está configurado com latin1 em vez de UTF-8)
SET NAMES utf8mb4;

SET CHARACTER SET utf8mb4;

-- ---------------------------------------------------------------------
-- Usuários (paciente comum ou admin do posto/secretaria de saúde)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    -- Autenticação
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM(
        'paciente',
        'atendente',
        'admin'
    ) NOT NULL DEFAULT 'paciente',
    admin_level ENUM(
        'superadmin',
        'gestor',
        'atendimento',
        'alertas'
    ) NULL,
    account_status ENUM(
        'ativo',
        'inativo',
        'pendente'
    ) NOT NULL DEFAULT 'ativo',
    -- Contato
    phone VARCHAR(30) NULL,
    mobile VARCHAR(30) NULL,
    -- Documentos (visíveis apenas para admin — nunca retornados em rotas de atendente)
    cpf VARCHAR(14) NULL,
    rg VARCHAR(15) NULL,
    -- Perfil pessoal
    birth_date DATE NULL,
    gender ENUM(
        'masculino',
        'feminino',
        'outro',
        'prefiro_nao_informar'
    ) NULL,
    blood_type ENUM(
        'A+',
        'A-',
        'B+',
        'B-',
        'AB+',
        'AB-',
        'O+',
        'O-'
    ) NULL,
    mother_name VARCHAR(150) NULL,
    father_name VARCHAR(150) NULL,
    -- Endereço
    cep VARCHAR(9) NULL,
    street VARCHAR(180) NULL,
    address_number VARCHAR(10) NULL,
    neighborhood VARCHAR(100) NULL,
    city VARCHAR(100) NULL,
    state CHAR(2) NULL,
    zone ENUM('urbana', 'rural') NULL,
    reference_point VARCHAR(255) NULL,
    -- Atendente apenas
    job_role VARCHAR(100) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME NULL
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Consultas médicas agendadas pelo usuário
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    specialty VARCHAR(120) NOT NULL,
    doctor VARCHAR(120) NULL,
    location VARCHAR(180) NOT NULL,
    scheduled_at DATETIME NOT NULL,
    notes TEXT NULL,
    status ENUM(
        'pendente',
        'confirmado',
        'cancelado',
        'concluido'
    ) NOT NULL DEFAULT 'pendente',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appointments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    INDEX idx_appointments_user (user_id),
    INDEX idx_appointments_scheduled (scheduled_at)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Lembretes do usuário (consultas, exames, avisos, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(150) NOT NULL,
    message VARCHAR(255) NULL,
    remind_at DATETIME NOT NULL,
    `read` TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reminders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    INDEX idx_reminders_user (user_id)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Alertas de doenças por região (gerenciado pelo admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diseases (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    region VARCHAR(150) NULL,
    alert_level ENUM('baixo', 'medio', 'alto') NOT NULL DEFAULT 'baixo',
    description TEXT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Exames (laboratoriais, imagem, etc.) — separado de consultas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    exam_type VARCHAR(60) NOT NULL,
    location VARCHAR(180) NOT NULL,
    scheduled_at DATETIME NOT NULL,
    notes TEXT NULL,
    status ENUM(
        'pendente',
        'confirmado',
        'cancelado',
        'concluido'
    ) NOT NULL DEFAULT 'pendente',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_exams_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    INDEX idx_exams_user (user_id),
    INDEX idx_exams_scheduled (scheduled_at)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Unidades de saúde — catálogo real (fonte: CNES, via ubs.med.br) usado
-- para popular o seletor de "Local" em consultas/exames. Telefones e
-- horários não foram confirmados na fonte pública; valide antes de
-- divulgar oficialmente.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_units (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    type ENUM(
        'ubs',
        'hospital',
        'clinica',
        'caps',
        'outro'
    ) NOT NULL DEFAULT 'ubs',
    neighborhood VARCHAR(120) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;

INSERT IGNORE INTO
    health_units (id, name, type, neighborhood)
VALUES (
        UUID(),
        'Posto de Saúde da Família José Cavalcanti de Petribu',
        'ubs',
        'Zona Rural'
    ),
    (
        UUID(),
        'Posto de Saúde da Família Progresso',
        'ubs',
        'Centro'
    ),
    (
        UUID(),
        'Posto de Saúde da Família Manoel Hermínio',
        'ubs',
        'Saudade'
    ),
    (
        UUID(),
        'Posto de Saúde da Família Boa Esperança',
        'ubs',
        'Vila Boa Esperança'
    ),
    (
        UUID(),
        'Posto de Saúde da Família Nova Itaenga',
        'ubs',
        'Nova Itaenga'
    ),
    (
        UUID(),
        'Posto de Saúde da Família Salinas',
        'ubs',
        'Salinas'
    ),
    (
        UUID(),
        'Posto de Saúde da Família Moinho',
        'ubs',
        'Moinho'
    ),
    (
        UUID(),
        'Casa de Saúde e Maternidade Josefa Cavalcanti de Petribu',
        'hospital',
        'Centro'
    ),
    (
        UUID(),
        'Policlínica Saúde São Sebastião',
        'clinica',
        'Centro'
    ),
    (
        UUID(),
        'CAPS Flor da Pedra',
        'caps',
        'Vila Boa Esperança'
    );

-- ---------------------------------------------------------------------
-- Log de auditoria — registra ações administrativas (confirmar, cancelar,
-- reagendar, gerenciar alertas) para rastreabilidade.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id CHAR(36) NOT NULL PRIMARY KEY,
    actor_id CHAR(36) NOT NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_id CHAR(36) NOT NULL,
    details VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE CASCADE,
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_created (created_at)
) ENGINE = InnoDB;