CREATE DATABASE  IF NOT EXISTS `project_management` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `project_management`;
-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: localhost    Database: project_management
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_groups`
--

DROP TABLE IF EXISTS `activity_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_groups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `name` varchar(200) NOT NULL,
  `position` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ag_project` (`project_id`),
  CONSTRAINT `fk_ag_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=164 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_groups`
--

LOCK TABLES `activity_groups` WRITE;
/*!40000 ALTER TABLE `activity_groups` DISABLE KEYS */;
INSERT INTO `activity_groups` VALUES (101,1,'Tenant Activation',0,'2026-04-29 08:49:25'),(102,1,'Vault Policy Setup',1,'2026-04-29 08:49:25'),(103,2,'Application Onboarding',0,'2026-04-29 08:49:25'),(104,2,'Authentication Setup',1,'2026-04-29 08:49:25'),(105,3,'Monitoring Setup',0,'2026-04-29 08:49:25'),(106,3,'Alert Optimization',1,'2026-04-29 08:49:25'),(107,4,'Quote Review',0,'2026-04-29 08:49:25'),(108,5,'Approval Workflow',0,'2026-04-29 08:49:25'),(114,1,'Tenant Activation',0,'2026-05-06 05:37:22'),(115,1,'Cloud Connector (Windows)',1,'2026-05-06 05:37:22'),(116,1,'UNIX Connector',2,'2026-05-06 05:37:22'),(117,1,'Secure Tunnel',3,'2026-05-06 05:37:22'),(118,3,'kill child process',2,'2026-05-06 05:53:39'),(119,7,'Discovery & Planning',0,'2026-05-06 06:04:25'),(121,7,'Vault Configuration',2,'2026-05-06 06:04:25'),(122,7,'Integration & Testing',3,'2026-05-06 06:04:25'),(123,7,'Go-Live & Handover',4,'2026-05-06 06:04:25'),(124,10,'Health Checks',0,'2026-05-06 06:04:25'),(125,10,'Access Reviews',1,'2026-05-06 06:04:25'),(126,10,'Patching & Upgrades',2,'2026-05-06 06:04:25'),(127,10,'Reporting',3,'2026-05-06 06:04:25'),(128,15,'License Assessment',0,'2026-05-06 06:04:25'),(130,15,'Renewal Execution',2,'2026-05-06 06:04:25'),(131,8,'Discovery & Planning',0,'2026-05-06 06:04:25'),(132,8,'Infrastructure Setup',1,'2026-05-06 06:04:25'),(133,8,'Vault Configuration',2,'2026-05-06 06:04:25'),(134,8,'Integration & Testing',3,'2026-05-06 06:04:25'),(135,8,'Go-Live & Handover',4,'2026-05-06 06:04:25'),(136,13,'License Assessment',0,'2026-05-06 06:04:25'),(137,13,'Quote & Approval',1,'2026-05-06 06:04:25'),(138,13,'Renewal Execution',2,'2026-05-06 06:04:25'),(139,16,'Prospecting',0,'2026-05-06 06:04:25'),(140,16,'Proposal',1,'2026-05-06 06:04:25'),(141,16,'Follow-up',2,'2026-05-06 06:04:26'),(142,9,'Discovery & Planning',0,'2026-05-06 06:04:26'),(143,9,'Infrastructure Setup',1,'2026-05-06 06:04:26'),(144,9,'Vault Configuration',2,'2026-05-06 06:04:26'),(145,9,'Integration & Testing',3,'2026-05-06 06:04:26'),(146,9,'Go-Live & Handover',4,'2026-05-06 06:04:26'),(147,12,'Health Checks',0,'2026-05-06 06:04:26'),(148,12,'Access Reviews',1,'2026-05-06 06:04:26'),(149,12,'Patching & Upgrades',2,'2026-05-06 06:04:26'),(150,12,'Reporting',3,'2026-05-06 06:04:26'),(151,17,'Prospecting',0,'2026-05-06 06:04:26'),(152,17,'Proposal',1,'2026-05-06 06:04:26'),(153,17,'Follow-up',2,'2026-05-06 06:04:26'),(154,11,'Health Checks',0,'2026-05-06 06:04:26'),(155,11,'Access Reviews',1,'2026-05-06 06:04:26'),(156,11,'Patching & Upgrades',2,'2026-05-06 06:04:26'),(157,11,'Reporting',3,'2026-05-06 06:04:26'),(158,14,'License Assessment',0,'2026-05-06 06:04:26'),(159,14,'Quote & Approval',1,'2026-05-06 06:04:26'),(160,14,'Renewal Execution',2,'2026-05-06 06:04:26'),(161,18,'Discovery',0,'2026-05-06 06:47:48'),(162,18,'POC',1,'2026-05-06 06:47:48'),(163,19,'Renewal Checklist',0,'2026-05-07 05:54:45');
/*!40000 ALTER TABLE `activity_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contacts`
--

DROP TABLE IF EXISTS `contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contacts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `customer_id` bigint NOT NULL,
  `name` varchar(200) NOT NULL,
  `role` varchar(100) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `email` varchar(200) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contacts_customer` (`customer_id`),
  CONSTRAINT `fk_contacts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contacts`
--

LOCK TABLES `contacts` WRITE;
/*!40000 ALTER TABLE `contacts` DISABLE KEYS */;
INSERT INTO `contacts` VALUES (1,17,'gaurav','admin',NULL,'abc@gmail.com','',NULL,'2026-05-06 06:45:52');
/*!40000 ALTER TABLE `contacts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer_users`
--

DROP TABLE IF EXISTS `customer_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `customer_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `role` enum('OWNER','ADMIN','MEMBER') DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_id` (`customer_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `customer_users_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `customer_users_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_users`
--

LOCK TABLES `customer_users` WRITE;
/*!40000 ALTER TABLE `customer_users` DISABLE KEYS */;
INSERT INTO `customer_users` VALUES (1,1,1,'OWNER'),(2,2,2,'OWNER'),(3,3,3,'OWNER'),(4,4,4,'OWNER'),(5,5,1,'ADMIN');
/*!40000 ALTER TABLE `customer_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `industry` varchar(100) DEFAULT NULL,
  `cyberark_tenant` varchar(200) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `idp` varchar(100) DEFAULT NULL,
  `siem` varchar(100) DEFAULT NULL,
  `license_type` varchar(100) DEFAULT NULL,
  `license_count` int DEFAULT NULL,
  `license_expiry` date DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customers`
--

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
INSERT INTO `customers` VALUES (1,'HDFC Bank','2026-04-29 08:49:25','2026-04-29 08:49:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(2,'ICICI Securities','2026-04-29 08:49:25','2026-04-29 08:49:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(3,'HCL Technologies','2026-04-29 08:49:25','2026-04-29 08:49:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(4,'Bajaj Finserv','2026-04-29 08:49:25','2026-04-29 08:49:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(5,'Axis Bank','2026-04-29 08:49:25','2026-04-29 08:49:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(6,'HDFC Bank','2026-05-06 05:37:22','2026-05-06 05:37:22','Banking',NULL,'Mumbai',NULL,NULL,NULL,NULL,NULL,NULL),(7,'ICICI Securities','2026-05-06 05:37:22','2026-05-06 05:37:22','Finance',NULL,'Mumbai',NULL,NULL,NULL,NULL,NULL,NULL),(8,'Tata Consultancy','2026-05-06 05:37:22','2026-05-06 05:37:22','IT Services',NULL,'Pune',NULL,NULL,NULL,NULL,NULL,NULL),(9,'Infosys','2026-05-06 05:37:22','2026-05-06 05:37:22','IT Services',NULL,'Bangalore',NULL,NULL,NULL,NULL,NULL,NULL),(10,'Wipro','2026-05-06 05:37:22','2026-05-06 05:37:22','IT Services',NULL,'Bangalore',NULL,NULL,NULL,NULL,NULL,NULL),(11,'HCL Technologies','2026-05-06 05:37:22','2026-05-06 05:37:22','IT Services',NULL,'Noida',NULL,NULL,NULL,NULL,NULL,NULL),(12,'Reliance Jio','2026-05-06 05:37:22','2026-05-06 05:37:22','Telecom',NULL,'Mumbai',NULL,NULL,NULL,NULL,NULL,NULL),(13,'Bajaj Finserv','2026-05-06 05:37:22','2026-05-06 05:37:22','Finance',NULL,'Pune',NULL,NULL,NULL,NULL,NULL,NULL),(14,'Axis Bank','2026-05-06 05:37:22','2026-05-06 05:37:22','Banking',NULL,'Mumbai',NULL,NULL,NULL,NULL,NULL,NULL),(15,'SBI Life','2026-05-06 05:37:22','2026-05-06 05:37:22','Insurance',NULL,'Mumbai',NULL,NULL,NULL,NULL,NULL,NULL),(16,'Kotak Securities','2026-05-06 05:37:22','2026-05-06 05:37:22','Finance',NULL,'Mumbai',NULL,NULL,NULL,NULL,NULL,NULL),(17,'Erasmith','2026-05-06 06:43:28','2026-05-06 06:43:28','IT','','Noida','','','Enterprise',200,'2026-05-31','');
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `document_links`
--

DROP TABLE IF EXISTS `document_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_links` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `document_id` bigint NOT NULL,
  `entity_type` enum('project','group','subtask') NOT NULL,
  `entity_id` bigint NOT NULL,
  `linked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_link` (`document_id`,`entity_type`,`entity_id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  CONSTRAINT `document_links_ibfk_1` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `document_links`
--

LOCK TABLES `document_links` WRITE;
/*!40000 ALTER TABLE `document_links` DISABLE KEYS */;
INSERT INTO `document_links` VALUES (2,4,'subtask',1200,'2026-05-06 09:03:34');
/*!40000 ALTER TABLE `document_links` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `documents`
--

DROP TABLE IF EXISTS `documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `documents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `customer_id` bigint NOT NULL,
  `name` varchar(300) NOT NULL,
  `type` varchar(100) DEFAULT 'Other',
  `status` varchar(50) NOT NULL DEFAULT 'Draft',
  `link` varchar(500) DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_docs_customer` (`customer_id`),
  CONSTRAINT `fk_docs_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `documents`
--

LOCK TABLES `documents` WRITE;
/*!40000 ALTER TABLE `documents` DISABLE KEYS */;
INSERT INTO `documents` VALUES (4,17,'Cyberark_project_implementation_plan_in_phases.pdf','Other','Draft','http://localhost:3001/uploads/17/1778058186738_Cyberark_project_implementation_plan_in_phases.pdf',NULL,'2026-05-06 09:03:06');
/*!40000 ALTER TABLE `documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `infra_links`
--

DROP TABLE IF EXISTS `infra_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `infra_links` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `infra_id` bigint NOT NULL,
  `entity_type` enum('project','group','subtask') NOT NULL,
  `entity_id` bigint NOT NULL,
  `linked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_infra_link` (`infra_id`,`entity_type`,`entity_id`),
  KEY `idx_il_entity` (`entity_type`,`entity_id`),
  CONSTRAINT `infra_links_ibfk_1` FOREIGN KEY (`infra_id`) REFERENCES `infra_servers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `infra_links`
--

LOCK TABLES `infra_links` WRITE;
/*!40000 ALTER TABLE `infra_links` DISABLE KEYS */;
/*!40000 ALTER TABLE `infra_links` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `infra_servers`
--

DROP TABLE IF EXISTS `infra_servers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `infra_servers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `customer_id` bigint NOT NULL,
  `hostname` varchar(200) NOT NULL,
  `ip_address` varchar(50) DEFAULT NULL,
  `os` varchar(100) DEFAULT NULL,
  `role` varchar(100) DEFAULT NULL,
  `environment` varchar(50) NOT NULL DEFAULT 'Production',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_infra_customer` (`customer_id`),
  CONSTRAINT `fk_infra_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `infra_servers`
--

LOCK TABLES `infra_servers` WRITE;
/*!40000 ALTER TABLE `infra_servers` DISABLE KEYS */;
/*!40000 ALTER TABLE `infra_servers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `project_tasks`
--

DROP TABLE IF EXISTS `project_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_tasks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `status` enum('TODO','IN_PROGRESS','BLOCKED','DONE') DEFAULT 'TODO',
  `priority` enum('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM',
  `due_date` date DEFAULT NULL,
  `assigned_to_user_id` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `assigned_to_user_id` (`assigned_to_user_id`),
  CONSTRAINT `project_tasks_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_tasks_ibfk_2` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=109 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_tasks`
--

LOCK TABLES `project_tasks` WRITE;
/*!40000 ALTER TABLE `project_tasks` DISABLE KEYS */;
INSERT INTO `project_tasks` VALUES (101,1,'Tenant Activation','Setup CyberArk tenant','IN_PROGRESS','HIGH','2025-05-20',1,'2026-04-29 08:49:25','2026-04-29 08:49:25'),(102,1,'Vault Policy Setup','Create vault policies','TODO','MEDIUM','2025-05-28',1,'2026-04-29 08:49:25','2026-04-29 08:49:25'),(103,2,'Application Onboarding','Onboard applications','IN_PROGRESS','HIGH','2025-06-05',2,'2026-04-29 08:49:25','2026-04-29 08:49:25'),(104,2,'Authentication Setup','Configure auth flow','TODO','HIGH','2025-06-18',2,'2026-04-29 08:49:25','2026-04-29 08:49:25'),(105,3,'Monitoring Setup','Setup alerts and monitoring','DONE','MEDIUM','2025-05-12',3,'2026-04-29 08:49:25','2026-04-29 08:49:25'),(106,3,'Alert Optimization','Reduce noise alerts','IN_PROGRESS','HIGH','2025-05-30',3,'2026-04-29 08:49:25','2026-04-29 08:49:25'),(107,4,'Quote Review','Review vendor quote','BLOCKED','HIGH','2025-05-10',4,'2026-04-29 08:49:25','2026-04-29 08:49:25'),(108,5,'Approval Workflow','Get approvals from stakeholders','IN_PROGRESS','HIGH','2025-05-08',1,'2026-04-29 08:49:25','2026-04-29 08:49:25');
/*!40000 ALTER TABLE `project_tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `customer_id` bigint NOT NULL,
  `owner_id` bigint DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `subtitle` varchar(255) DEFAULT NULL,
  `type` varchar(100) DEFAULT 'Implementation',
  `status` varchar(50) DEFAULT 'On Track',
  `start_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `progress_percent` decimal(5,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `notes` text,
  PRIMARY KEY (`id`),
  KEY `customer_id` (`customer_id`),
  KEY `owner_user_id` (`owner_id`),
  CONSTRAINT `projects_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `projects_ibfk_2` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projects`
--

LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
INSERT INTO `projects` VALUES (1,1,1,'CyberArk PAM Rollout','Phase 2 – PAM vault config','Implementation','Delayed','2025-05-01','2025-06-30',20.00,'2026-04-29 08:49:25','2026-05-06 06:34:27',NULL),(2,2,2,'App Onboarding Wave 3','Legacy systems onboarding','Implementation','Delayed','2025-05-10','2025-07-31',25.00,'2026-04-29 08:49:25','2026-05-06 06:34:27',NULL),(3,3,3,'Vault Operations','24x7 managed service','Managed Service','Delayed','2025-04-15','2025-06-20',40.00,'2026-04-29 08:49:25','2026-05-06 06:34:27',NULL),(4,4,4,'License Renewal Q2','CyberArk license renewal','License Renewal','Completed','2025-04-20','2025-05-25',10.00,'2026-04-29 08:49:25','2026-05-06 06:14:58',NULL),(5,5,1,'Enterprise Renewal','Annual license renewal','License Renewal','Delayed','2025-04-01','2025-05-15',15.00,'2026-04-29 08:49:25','2026-05-06 06:34:27',NULL),(7,1,1,'HDFC Bank Implementation','Phase 2 – PAM vault config','Implementation','Delayed',NULL,'2025-06-30',0.00,'2026-05-06 05:37:22','2026-05-06 06:36:39',NULL),(8,2,2,'ICICI Securities Implementation','Connector rollout','Implementation','Delayed',NULL,'2025-07-31',0.00,'2026-05-06 05:37:22','2026-05-06 06:34:27',NULL),(9,3,3,'TCS Implementation','Vault onboarding','Implementation','Delayed',NULL,'2025-05-15',0.00,'2026-05-06 05:37:22','2026-05-06 06:34:27',NULL),(10,4,1,'Infosys Managed Service','Steady-state operations','Managed Service','Delayed',NULL,'2025-01-01',0.00,'2026-05-06 05:37:22','2026-05-06 06:34:27',NULL),(11,5,4,'Wipro Managed Service','Monthly health checks','Managed Service','Delayed',NULL,'2025-12-31',0.00,'2026-05-06 05:37:22','2026-05-06 06:34:27',NULL),(12,6,3,'HCL Managed Service','Incident response support','Managed Service','Delayed',NULL,'2025-10-31',0.00,'2026-05-06 05:37:22','2026-05-06 06:34:27',NULL),(13,7,2,'Reliance Jio License Renewal','Annual license renewal','License Renewal','Delayed',NULL,'2025-05-01',0.00,'2026-05-06 05:37:22','2026-05-06 06:34:27',NULL),(14,8,4,'Bajaj Finserv License Renewal','License expansion + renewal','License Renewal','Delayed',NULL,'2025-06-30',0.00,'2026-05-06 05:37:22','2026-05-06 06:34:27',NULL),(15,9,1,'Axis Bank License Renewal','Renewal overdue – escalated','License Renewal','Delayed',NULL,'2025-02-28',0.00,'2026-05-06 05:37:22','2026-05-06 06:34:27',NULL),(16,10,2,'SBI Life Opportunity','Presales POC','New Opportunity','Prospecting',NULL,NULL,0.00,'2026-05-06 05:37:22','2026-05-06 05:37:22',NULL),(17,11,3,'Kotak Securities Opportunity','Initial discovery call done','New Opportunity','Prospecting',NULL,NULL,0.00,'2026-05-06 05:37:22','2026-05-06 05:37:22',NULL),(18,17,11,'Task Mangement','a demo task for functional testing','New Opportunity','Prospecting',NULL,'2026-05-06',0.00,'2026-05-06 06:47:48','2026-05-06 06:47:48',NULL),(19,16,3,'Child Support','','License Renewal','On Track',NULL,'2026-05-31',0.00,'2026-05-07 05:54:45','2026-05-07 05:54:45',NULL);
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subtask_log`
--

DROP TABLE IF EXISTS `subtask_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subtask_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `subtask_id` bigint NOT NULL,
  `changed_by` varchar(100) DEFAULT NULL,
  `field_name` varchar(50) DEFAULT NULL,
  `old_value` text,
  `new_value` text,
  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_log_subtask` (`subtask_id`),
  CONSTRAINT `fk_log_subtask` FOREIGN KEY (`subtask_id`) REFERENCES `subtasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=179 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subtask_log`
--

LOCK TABLES `subtask_log` WRITE;
/*!40000 ALTER TABLE `subtask_log` DISABLE KEYS */;
INSERT INTO `subtask_log` VALUES (1,1002,'system','status','In Progress','Done','2026-04-30 06:02:41'),(2,1002,'system','status','Done','In Progress','2026-04-30 06:04:31'),(3,1003,'system','status','Not Started','Blocked','2026-05-04 05:10:05'),(4,1003,'system','flag_type',NULL,'Technical blocker','2026-05-04 05:10:05'),(5,1003,'system','flag_reason',NULL,'Firewall blocking port 443','2026-05-04 05:10:05'),(6,1003,'system','status','Blocked','In Progress','2026-05-04 05:22:48'),(7,1003,'system','flag_type','Technical blocker',NULL,'2026-05-04 05:22:48'),(8,1003,'system','flag_reason','Firewall blocking port 443',NULL,'2026-05-04 05:22:48'),(9,1004,'system','status','Not Started','In Progress','2026-05-04 05:27:05'),(10,1004,'system','status','In Progress','In Testing','2026-05-04 05:27:08'),(11,1004,'system','status','In Testing','Awaiting Feedback','2026-05-04 05:27:10'),(12,1004,'system','status','Awaiting Feedback','Not Started','2026-05-04 05:27:13'),(13,1005,'system','status','Not Started','Done','2026-05-04 05:27:16'),(14,1004,'system','status','Not Started','Awaiting Feedback','2026-05-04 05:28:16'),(15,1005,'system','status','Done','Not Started','2026-05-04 05:28:29'),(16,1001,'system','status','Done','Blocked','2026-05-04 05:28:41'),(17,1001,'system','status','Blocked','Awaiting Feedback','2026-05-04 05:28:44'),(18,1002,'system','status','In Progress','Not Started','2026-05-04 05:28:47'),(19,1003,'system','status','In Progress','Not Started','2026-05-04 05:28:49'),(20,1002,'system','status','Not Started','In Progress','2026-05-04 05:46:10'),(21,1002,'system','status','In Progress','In Testing','2026-05-04 05:46:10'),(22,1002,'system','status','In Testing','Awaiting Feedback','2026-05-04 05:46:10'),(23,1002,'system','status','Awaiting Feedback','Blocked','2026-05-04 05:46:10'),(24,1002,'system','status','Blocked','Done','2026-05-04 05:46:10'),(25,1002,'system','status','Done','In Progress','2026-05-04 05:48:03'),(26,1002,'system','status','In Progress','Awaiting Feedback','2026-05-04 05:53:11'),(27,1002,'system','flag_type',NULL,'Waiting for approval','2026-05-04 05:53:11'),(28,1002,'system','flag_reason',NULL,'test','2026-05-04 05:53:11'),(29,1002,'system','flag_type','Waiting for approval','Waiting for customer','2026-05-04 05:53:11'),(30,1002,'system','flag_type','Waiting for customer','Waiting for third party','2026-05-04 05:53:11'),(31,1002,'system','flag_type','Waiting for third party','Waiting for approval','2026-05-04 05:56:41'),(32,1002,'system','status','Awaiting Feedback','Blocked','2026-05-04 05:57:01'),(33,1002,'system','flag_type','Waiting for approval','Technical blocker','2026-05-04 05:57:01'),(34,1002,'system','flag_reason','test','test reason','2026-05-04 05:57:01'),(35,1002,'system','flag_type','Technical blocker','Resource unavailable','2026-05-04 05:57:01'),(36,1002,'system','flag_type','Resource unavailable','Dependency blocked','2026-05-04 05:57:01'),(37,1002,'system','flag_type','Dependency blocked','Other','2026-05-04 05:57:01'),(38,1002,'system','status','Blocked','In Progress','2026-05-04 05:58:17'),(39,1002,'system','flag_type','Other',NULL,'2026-05-04 05:58:17'),(40,1002,'system','flag_reason','test reason',NULL,'2026-05-04 05:58:17'),(41,1001,'system','status','Awaiting Feedback','Not Started','2026-05-04 06:02:55'),(42,1001,'system','flag_type',NULL,NULL,'2026-05-04 06:02:55'),(43,1001,'system','flag_reason',NULL,NULL,'2026-05-04 06:02:55'),(44,1002,'system','status','In Progress','Not Started','2026-05-04 06:02:55'),(45,1002,'system','flag_type',NULL,NULL,'2026-05-04 06:02:55'),(46,1002,'system','flag_reason',NULL,NULL,'2026-05-04 06:02:55'),(47,1003,'system','flag_type',NULL,NULL,'2026-05-04 06:02:55'),(48,1003,'system','flag_reason',NULL,NULL,'2026-05-04 06:02:55'),(49,1004,'system','status','Awaiting Feedback','Not Started','2026-05-04 06:02:55'),(50,1004,'system','flag_type',NULL,NULL,'2026-05-04 06:02:55'),(51,1004,'system','flag_reason',NULL,NULL,'2026-05-04 06:02:55'),(52,1005,'system','flag_type',NULL,NULL,'2026-05-04 06:02:55'),(53,1005,'system','flag_reason',NULL,NULL,'2026-05-04 06:02:55'),(54,1001,'system','status','Not Started','Done','2026-05-04 06:02:55'),(55,1002,'system','status','Not Started','In Progress','2026-05-04 06:05:58'),(56,1002,'system','status','In Progress','In Testing','2026-05-04 06:05:58'),(57,1002,'system','status','In Testing','Awaiting Feedback','2026-05-04 06:05:58'),(58,1002,'system','status','Awaiting Feedback','Blocked','2026-05-04 06:05:58'),(59,1002,'system','status','Blocked','Done','2026-05-04 06:05:59'),(60,1002,'system','status','Done','In Progress','2026-05-04 06:06:19'),(61,1002,'system','status','In Progress','Done','2026-05-04 06:06:19'),(62,1002,'system','status','Done','In Progress','2026-05-04 06:06:19'),(63,1002,'system','status','In Progress','Done','2026-05-04 06:07:51'),(64,1003,'system','status','Not Started','Done','2026-05-04 06:07:51'),(65,1003,'system','status','Done','Not Started','2026-05-04 06:07:51'),(66,1002,'system','status','Done','In Progress','2026-05-04 06:08:24'),(67,1002,'system','status','In Progress','Done','2026-05-04 06:08:24'),(68,1002,'system','status','Done','In Progress','2026-05-04 06:08:24'),(69,1002,'system','status','In Progress','Done','2026-05-04 06:08:24'),(70,1002,'system','status','Done','In Progress','2026-05-04 06:08:24'),(71,1002,'system','status','In Progress','InvalidStatus','2026-05-04 06:09:38'),(72,1002,'system','status','InvalidStatus','In Progress','2026-05-04 06:09:38'),(73,1002,'system','status','In Progress','BadVal','2026-05-04 06:20:33'),(74,1002,'system','status','BadVal','In Progress','2026-05-04 06:20:51'),(75,1003,'system','status','Not Started','In Testing','2026-05-04 06:21:13'),(76,1003,'system','status','In Testing','Not Started','2026-05-04 06:21:14'),(77,1002,'system','status','In Progress','Awaiting Feedback','2026-05-04 06:21:40'),(78,1002,'system','flag_type',NULL,'Waiting for approval','2026-05-04 06:21:40'),(79,1002,'system','flag_reason',NULL,'test','2026-05-04 06:21:40'),(80,1002,'system','flag_type','Waiting for approval','Waiting for customer','2026-05-04 06:21:40'),(81,1002,'system','flag_type','Waiting for customer','Waiting for third party','2026-05-04 06:21:40'),(82,1002,'system','status','Awaiting Feedback','Blocked','2026-05-04 06:22:05'),(83,1002,'system','flag_type','Waiting for third party','Technical blocker','2026-05-04 06:22:05'),(84,1002,'system','flag_reason','test','test reason','2026-05-04 06:22:05'),(85,1002,'system','flag_type','Technical blocker','Resource unavailable','2026-05-04 06:22:05'),(86,1002,'system','flag_type','Resource unavailable','Dependency blocked','2026-05-04 06:22:05'),(87,1002,'system','flag_type','Dependency blocked','Other','2026-05-04 06:22:05'),(88,1002,'system','status','Blocked','In Progress','2026-05-04 06:23:23'),(89,1002,'system','flag_type','Other',NULL,'2026-05-04 06:23:23'),(90,1002,'system','flag_reason','test reason',NULL,'2026-05-04 06:23:23'),(91,1002,'system','status','In Progress','Blocked','2026-05-04 06:24:45'),(92,1002,'system','flag_type',NULL,'Technical blocker','2026-05-04 06:24:45'),(93,1002,'system','flag_reason',NULL,'Port 443 blocked','2026-05-04 06:24:45'),(94,1002,'system','flag_type','Technical blocker','Other','2026-05-04 06:36:00'),(95,1002,'system','flag_reason','Port 443 blocked','','2026-05-04 06:36:00'),(96,1001,'system','status','Done','Blocked','2026-05-04 06:37:14'),(97,1001,'system','flag_type',NULL,'Technical blocker','2026-05-04 06:37:14'),(98,1001,'system','flag_reason',NULL,'r1','2026-05-04 06:37:14'),(99,1002,'system','status','Blocked','Awaiting Feedback','2026-05-04 06:37:15'),(100,1002,'system','flag_type','Other','Waiting for customer','2026-05-04 06:37:15'),(101,1002,'system','flag_reason','','r2','2026-05-04 06:37:15'),(102,1001,'system','status','Blocked','In Progress','2026-05-04 06:40:46'),(103,1001,'system','flag_type','Technical blocker',NULL,'2026-05-04 06:40:46'),(104,1001,'system','flag_reason','r1',NULL,'2026-05-04 06:40:46'),(105,1002,'system','status','Awaiting Feedback','In Progress','2026-05-04 06:40:46'),(106,1002,'system','flag_type','Waiting for customer',NULL,'2026-05-04 06:40:46'),(107,1002,'system','flag_reason','r2',NULL,'2026-05-04 06:40:46'),(108,1002,'system','status','In Progress','Blocked','2026-05-04 06:53:41'),(109,1002,'system','flag_type',NULL,'Technical blocker','2026-05-04 06:53:42'),(110,1002,'system','flag_reason',NULL,'audit test','2026-05-04 06:53:42'),(111,1002,'system','flag_type','Technical blocker','Dependency blocked','2026-05-04 06:54:28'),(112,1002,'system','flag_reason','audit test','dep test','2026-05-04 06:54:28'),(113,1002,'system','status','Blocked','In Progress','2026-05-04 06:54:28'),(114,1002,'system','flag_type','Dependency blocked',NULL,'2026-05-04 06:54:28'),(115,1002,'system','flag_reason','dep test',NULL,'2026-05-04 06:54:28'),(116,1003,'system','status','Not Started','Blocked','2026-05-04 06:54:55'),(117,1003,'system','flag_type',NULL,'Resource unavailable','2026-05-04 06:54:55'),(118,1003,'system','flag_reason',NULL,'person on leave','2026-05-04 06:54:55'),(119,1003,'system','status','Blocked','Not Started','2026-05-04 06:54:55'),(120,1003,'system','flag_type','Resource unavailable',NULL,'2026-05-04 06:54:55'),(121,1003,'system','flag_reason','person on leave',NULL,'2026-05-04 06:54:55'),(122,1001,'system','assignee_id',NULL,'1','2026-05-05 06:45:04'),(123,1002,'system','assignee_id',NULL,'1','2026-05-05 06:45:04'),(124,1011,'system','status','Blocked','In Progress','2026-05-06 05:52:10'),(125,1011,'system','status','In Progress','Done','2026-05-06 05:52:15'),(126,1011,'system','assignee_id',NULL,'6','2026-05-06 05:52:35'),(127,1047,'system','status','Not Started','Done','2026-05-06 05:54:10'),(128,1082,'system','status','Not Started','Done','2026-05-06 06:09:10'),(129,1083,'system','status','Not Started','Done','2026-05-06 06:09:12'),(130,1084,'system','status','Not Started','Done','2026-05-06 06:09:14'),(134,1088,'system','status','Not Started','Done','2026-05-06 06:09:34'),(135,1089,'system','status','Not Started','Done','2026-05-06 06:09:35'),(136,1090,'system','status','Not Started','Done','2026-05-06 06:09:36'),(137,1091,'system','status','Not Started','Done','2026-05-06 06:09:37'),(138,1082,'system','status','Done','In Progress','2026-05-06 06:16:33'),(139,1083,'system','status','Done','Blocked','2026-05-06 06:16:56'),(140,1084,'system','status','Done','Awaiting Feedback','2026-05-06 06:17:34'),(141,1048,'system','status','Not Started','Done','2026-05-06 06:36:05'),(142,1049,'system','status','Not Started','Done','2026-05-06 06:36:06'),(143,1050,'system','status','Not Started','Done','2026-05-06 06:36:07'),(144,1051,'system','status','Not Started','Done','2026-05-06 06:36:08'),(146,1064,'system','status','Not Started','Done','2026-05-06 06:36:19'),(147,1065,'system','status','Not Started','Done','2026-05-06 06:36:20'),(148,1066,'system','status','Not Started','Done','2026-05-06 06:36:21'),(149,1067,'system','status','Not Started','Done','2026-05-06 06:36:22'),(150,1060,'system','status','Not Started','Done','2026-05-06 06:36:24'),(151,1061,'system','status','Not Started','Done','2026-05-06 06:36:25'),(152,1062,'system','status','Not Started','Done','2026-05-06 06:36:26'),(153,1063,'system','status','Not Started','Done','2026-05-06 06:36:26'),(154,1056,'system','status','Not Started','Done','2026-05-06 06:36:29'),(155,1057,'system','status','Not Started','Done','2026-05-06 06:36:29'),(156,1058,'system','status','Not Started','Done','2026-05-06 06:36:30'),(157,1059,'system','status','Not Started','Done','2026-05-06 06:36:31'),(158,1049,'system','status','Done','Awaiting Feedback','2026-05-06 06:36:39'),(159,1049,'system','status','Awaiting Feedback','In Testing','2026-05-06 06:36:42'),(160,1049,'system','status','In Testing','Awaiting Feedback','2026-05-06 06:36:46'),(161,1049,'system','status','Awaiting Feedback','Blocked','2026-05-06 06:36:49'),(162,1051,'system','status','Done','Blocked','2026-05-06 06:36:53'),(163,1048,'system','status','Done','Blocked','2026-05-06 06:36:55'),(164,1050,'system','status','Done','Blocked','2026-05-06 06:36:57'),(165,1056,'system','status','Done','Blocked','2026-05-06 06:37:01'),(166,1057,'system','status','Done','Blocked','2026-05-06 06:37:03'),(167,1058,'system','status','Done','Blocked','2026-05-06 06:37:06'),(168,1059,'system','status','Done','Blocked','2026-05-06 06:37:07'),(169,1060,'system','status','Done','Blocked','2026-05-06 06:37:12'),(170,1061,'system','status','Done','Awaiting Feedback','2026-05-06 06:37:16'),(171,1062,'system','status','Done','Awaiting Feedback','2026-05-06 06:37:18'),(172,1063,'system','status','Done','Awaiting Feedback','2026-05-06 06:37:20'),(173,1064,'system','status','Done','Awaiting Feedback','2026-05-06 06:37:24'),(174,1065,'system','status','Done','In Progress','2026-05-06 06:37:26'),(175,1066,'system','status','Done','Not Started','2026-05-06 06:37:28'),(176,1067,'system','status','Done','Not Started','2026-05-06 06:37:31'),(177,1200,'system','assignee_id',NULL,'11','2026-05-06 06:48:35'),(178,1200,'system','status','Not Started','Done','2026-05-06 09:03:44');
/*!40000 ALTER TABLE `subtask_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subtasks`
--

DROP TABLE IF EXISTS `subtasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subtasks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `group_id` bigint NOT NULL,
  `name` varchar(300) NOT NULL,
  `assignee_id` bigint DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'Not Started',
  `due_date` date DEFAULT NULL,
  `position` int NOT NULL DEFAULT '0',
  `flag_type` varchar(100) DEFAULT NULL,
  `flag_reason` text,
  `flag_waiting_on` varchar(200) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sub_group` (`group_id`),
  KEY `idx_sub_assignee` (`assignee_id`),
  CONSTRAINT `fk_sub_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sub_group` FOREIGN KEY (`group_id`) REFERENCES `activity_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1213 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subtasks`
--

LOCK TABLES `subtasks` WRITE;
/*!40000 ALTER TABLE `subtasks` DISABLE KEYS */;
INSERT INTO `subtasks` VALUES (1001,101,'Provision Tenant',1,'In Progress','2025-05-08',0,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1002,101,'Customer Access',1,'In Progress','2025-05-10',1,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1003,101,'Implementor Access',NULL,'Not Started','2025-05-12',2,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1004,102,'Define Policies',NULL,'Not Started','2025-05-22',0,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1005,102,'Assign Roles',NULL,'Not Started','2025-05-24',1,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1006,103,'Collect App List',NULL,'Done','2025-05-20',0,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1007,103,'Owner Approval',NULL,'In Progress','2025-05-27',1,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1008,103,'Credential Validation',NULL,'Not Started','2025-05-30',2,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1009,105,'Create SOP',NULL,'Done','2025-05-02',0,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1010,106,'Tune Alerts',NULL,'In Progress','2025-05-18',0,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1011,107,'Budget Approval',6,'Done','2025-05-14',0,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1012,108,'Send Request',NULL,'In Progress','2025-05-05',0,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1013,108,'Follow-up',NULL,'Not Started','2025-05-07',1,NULL,NULL,NULL,'2026-04-29 08:49:25'),(1047,118,'run scripts provided',NULL,'Done',NULL,0,NULL,NULL,NULL,'2026-05-06 05:54:03'),(1048,119,'Kickoff meeting',1,'Blocked',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1049,119,'Requirements gathering',1,'Blocked',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1050,119,'Architecture review',1,'Blocked',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1051,119,'Sign-off on scope',1,'Blocked',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1056,121,'Install CyberArk Vault',1,'Blocked',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1057,121,'Configure DR Vault',1,'Blocked',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1058,121,'Set up PVWA',1,'Blocked',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1059,121,'Configure CPM',1,'Blocked',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1060,122,'LDAP/AD integration',1,'Blocked',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1061,122,'SIEM integration',1,'Awaiting Feedback',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1062,122,'UAT sign-off',1,'Awaiting Feedback',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1063,122,'Performance testing',1,'Awaiting Feedback',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1064,123,'Production cutover',1,'Awaiting Feedback',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1065,123,'Admin training',1,'In Progress',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1066,123,'Documentation handover',1,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1067,123,'Project closure',1,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1068,124,'Vault health check',1,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1069,124,'CPM health check',1,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1070,124,'PVWA health check',1,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1071,124,'DR test',1,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1072,125,'Privileged account review',1,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1073,125,'Safe membership review',1,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1074,125,'Orphan account cleanup',1,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1075,126,'Patch assessment',1,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1076,126,'Test environment patch',1,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1077,126,'Production patch',1,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1078,126,'Post-patch validation',1,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1079,127,'Monthly status report',1,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1080,127,'Compliance report',1,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1081,127,'Incident summary',1,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1082,128,'Current usage audit',1,'In Progress',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1083,128,'Forecast next year usage',1,'Blocked',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1084,128,'Identify gaps',1,'Awaiting Feedback',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1088,130,'PO raised',1,'Done',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1089,130,'License keys received',1,'Done',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1090,130,'Keys applied to Vault',1,'Done',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1091,130,'Confirmation to customer',1,'Done',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1092,131,'Kickoff meeting',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1093,131,'Requirements gathering',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1094,131,'Architecture review',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1095,131,'Sign-off on scope',2,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1096,132,'Provision servers',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1097,132,'Network configuration',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1098,132,'Firewall rules',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1099,132,'SSL certificates',2,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1100,133,'Install CyberArk Vault',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1101,133,'Configure DR Vault',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1102,133,'Set up PVWA',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1103,133,'Configure CPM',2,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1104,134,'LDAP/AD integration',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1105,134,'SIEM integration',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1106,134,'UAT sign-off',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1107,134,'Performance testing',2,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1108,135,'Production cutover',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1109,135,'Admin training',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1110,135,'Documentation handover',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1111,135,'Project closure',2,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1112,136,'Current usage audit',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1113,136,'Forecast next year usage',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1114,136,'Identify gaps',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1115,137,'Request quote from CyberArk',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1116,137,'Internal budget approval',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1117,137,'Legal review',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1118,138,'PO raised',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1119,138,'License keys received',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1120,138,'Keys applied to Vault',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1121,138,'Confirmation to customer',2,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1122,139,'Initial discovery call',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1123,139,'Pain point analysis',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1124,139,'Stakeholder mapping',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1125,140,'Draft proposal',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:25'),(1126,140,'Technical demo',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1127,140,'Commercial discussion',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1128,140,'Submit proposal',2,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1129,141,'Follow-up call',2,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1130,141,'Address objections',2,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1131,141,'Final negotiation',2,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1132,142,'Kickoff meeting',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1133,142,'Requirements gathering',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1134,142,'Architecture review',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1135,142,'Sign-off on scope',3,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1136,143,'Provision servers',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1137,143,'Network configuration',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1138,143,'Firewall rules',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1139,143,'SSL certificates',3,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1140,144,'Install CyberArk Vault',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1141,144,'Configure DR Vault',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1142,144,'Set up PVWA',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1143,144,'Configure CPM',3,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1144,145,'LDAP/AD integration',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1145,145,'SIEM integration',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1146,145,'UAT sign-off',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1147,145,'Performance testing',3,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1148,146,'Production cutover',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1149,146,'Admin training',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1150,146,'Documentation handover',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1151,146,'Project closure',3,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1152,147,'Vault health check',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1153,147,'CPM health check',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1154,147,'PVWA health check',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1155,147,'DR test',3,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1156,148,'Privileged account review',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1157,148,'Safe membership review',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1158,148,'Orphan account cleanup',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1159,149,'Patch assessment',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1160,149,'Test environment patch',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1161,149,'Production patch',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1162,149,'Post-patch validation',3,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1163,150,'Monthly status report',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1164,150,'Compliance report',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1165,150,'Incident summary',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1166,151,'Initial discovery call',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1167,151,'Pain point analysis',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1168,151,'Stakeholder mapping',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1169,152,'Draft proposal',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1170,152,'Technical demo',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1171,152,'Commercial discussion',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1172,152,'Submit proposal',3,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1173,153,'Follow-up call',3,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1174,153,'Address objections',3,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1175,153,'Final negotiation',3,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1176,154,'Vault health check',4,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1177,154,'CPM health check',4,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1178,154,'PVWA health check',4,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1179,154,'DR test',4,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1180,155,'Privileged account review',4,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1181,155,'Safe membership review',4,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1182,155,'Orphan account cleanup',4,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1183,156,'Patch assessment',4,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1184,156,'Test environment patch',4,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1185,156,'Production patch',4,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1186,156,'Post-patch validation',4,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1187,157,'Monthly status report',4,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1188,157,'Compliance report',4,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1189,157,'Incident summary',4,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1190,158,'Current usage audit',4,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1191,158,'Forecast next year usage',4,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1192,158,'Identify gaps',4,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1193,159,'Request quote from CyberArk',4,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1194,159,'Internal budget approval',4,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1195,159,'Legal review',4,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1196,160,'PO raised',4,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1197,160,'License keys received',4,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1198,160,'Keys applied to Vault',4,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1199,160,'Confirmation to customer',4,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-06 06:04:26'),(1200,161,'Initial discovery call',11,'Done',NULL,0,NULL,NULL,NULL,'2026-05-06 06:47:48'),(1201,161,'Requirements gathering',NULL,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:47:48'),(1202,161,'Stakeholder mapping',NULL,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:47:48'),(1203,162,'POC environment setup',NULL,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-06 06:47:48'),(1204,162,'Demo delivery',NULL,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-06 06:47:48'),(1205,162,'POC sign-off',NULL,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-06 06:47:48'),(1206,163,'Review current licenses',NULL,'Not Started',NULL,0,NULL,NULL,NULL,'2026-05-07 05:54:45'),(1207,163,'Confirm user count',NULL,'Not Started',NULL,1,NULL,NULL,NULL,'2026-05-07 05:54:45'),(1208,163,'Raise renewal PO',NULL,'Not Started',NULL,2,NULL,NULL,NULL,'2026-05-07 05:54:45'),(1209,163,'Update contract',NULL,'Not Started',NULL,3,NULL,NULL,NULL,'2026-05-07 05:54:45'),(1210,163,'Share confirmation with customer',NULL,'Not Started',NULL,4,NULL,NULL,NULL,'2026-05-07 05:54:45'),(1211,163,'Internal approval',NULL,'Not Started',NULL,5,NULL,NULL,NULL,'2026-05-07 05:54:45'),(1212,163,'Close renewal ticket',NULL,'Not Started',NULL,6,NULL,NULL,NULL,'2026-05-07 05:54:45');
/*!40000 ALTER TABLE `subtasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_subtasks`
--

DROP TABLE IF EXISTS `task_subtasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_subtasks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `task_id` bigint NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `status` enum('TODO','IN_PROGRESS','BLOCKED','DONE') DEFAULT 'TODO',
  `due_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `task_id` (`task_id`),
  CONSTRAINT `task_subtasks_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `project_tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1014 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `task_subtasks`
--

LOCK TABLES `task_subtasks` WRITE;
/*!40000 ALTER TABLE `task_subtasks` DISABLE KEYS */;
INSERT INTO `task_subtasks` VALUES (1001,101,'Provision Tenant','Create tenant instance','DONE','2025-05-08','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1002,101,'Customer Access','Give access to client','IN_PROGRESS','2025-05-10','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1003,101,'Implementor Access','Give access to engineer','TODO','2025-05-12','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1004,102,'Define Policies','Create base policies','TODO','2025-05-22','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1005,102,'Assign Roles','Assign user roles','TODO','2025-05-24','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1006,103,'Collect App List','Gather all applications','DONE','2025-05-20','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1007,103,'Owner Approval','Get approvals','IN_PROGRESS','2025-05-27','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1008,103,'Credential Validation','Check credentials','TODO','2025-05-30','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1009,105,'Create SOP','Document SOP','DONE','2025-05-02','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1010,106,'Tune Alerts','Adjust thresholds','IN_PROGRESS','2025-05-18','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1011,107,'Budget Approval','Get finance approval','BLOCKED','2025-05-14','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1012,108,'Send Request','Send approval mail','IN_PROGRESS','2025-05-05','2026-04-29 08:49:25','2026-04-29 08:49:25'),(1013,108,'Follow-up','Reminder to stakeholders','TODO','2025-05-07','2026-04-29 08:49:25','2026-04-29 08:49:25');
/*!40000 ALTER TABLE `task_subtasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `username` varchar(100) DEFAULT NULL,
  `full_name` varchar(200) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `role` enum('ADMIN','MANAGER','MEMBER') NOT NULL DEFAULT 'MEMBER',
  `status` enum('active','inactive','disabled') NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `password_hash` varchar(255) DEFAULT NULL,
  `availability` enum('Active','Busy','Away','Be Right Back','In a Meeting','Offline') NOT NULL DEFAULT 'Offline',
  `availability_updated_at` timestamp NULL DEFAULT NULL,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `email_active` varchar(200) GENERATED ALWAYS AS (if((`deleted_at` is null),`email`,NULL)) VIRTUAL,
  `username_active` varchar(100) GENERATED ALWAYS AS (if((`deleted_at` is null),`username`,NULL)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email_active` (`email_active`),
  UNIQUE KEY `uq_username_active` (`username_active`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` (`id`, `name`, `username`, `full_name`, `email`, `role`, `status`, `created_at`, `updated_at`, `password_hash`, `availability`, `availability_updated_at`, `last_login_at`, `deleted_at`) VALUES (1,'Rahul','rahul',NULL,'rahul@test.com','MANAGER','active','2026-04-29 08:49:25','2026-05-07 09:20:38','$2b$12$0.10YNeRtt3KdxtBLzFdFuRV0WdLyohf3mbQsUkPYUeNpd.ML5N8K','Offline',NULL,NULL,NULL),(2,'Priya','priya',NULL,'priya@test.com','MANAGER','active','2026-04-29 08:49:25','2026-05-07 09:20:38','$2b$12$v2ShzxU/ptVaVx5Jhy2aLuHOZAp.uT.RsmUr5KbcTQouM/fIHrDNC','Offline',NULL,NULL,NULL),(3,'Amit','amit','','amit@test.com','MANAGER','active','2026-04-29 08:49:25','2026-05-07 10:02:03','$2b$12$HATXLidrlTJLw90crD9eNeu8G3tMabxVWkiRnprmCWRc0rYTXgO2e','Offline',NULL,NULL,NULL),(4,'Sneha','sneha',NULL,'sneha@test.com','MANAGER','active','2026-04-29 08:49:25','2026-05-07 10:03:22','$2b$12$ItwYAN.9uDmWN89xoRZFpex.WjUgwY0ThcnvBA7jM.I2JQMWEHvsa','Active','2026-05-07 10:03:22','2026-05-07 10:03:22',NULL),(6,'Admin','admin',NULL,'admin@cyberark.com','ADMIN','active','2026-05-05 07:05:52','2026-05-07 10:03:09','$2b$12$haZH/NxrNSlNQTCoOS/pG.ZSxsWJ8CpOHNKktQ9l9lfsBHZvuSp.i','Offline','2026-05-07 10:03:09','2026-05-07 09:55:39',NULL),(11,'yuvraj','yuvraj',NULL,'yuvraj.jaiswal@erasmith.com','MEMBER','disabled','2026-05-06 06:39:41','2026-05-07 09:55:50',NULL,'Offline',NULL,NULL,'2026-05-07 09:55:50');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'project_management'
--

--
-- Dumping routines for database 'project_management'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-08 11:30:18
