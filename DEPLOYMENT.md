# RecruiterOS — Deployment Guide

This guide describes how to deploy the RecruiterOS monorepo (Backend and Frontend services) to Google Cloud Run.

---

## 1. Prerequisites

Before beginning, ensure you have:
* A **Google Cloud Platform (GCP)** account and an active project.
* The **Google Cloud SDK (gcloud)** installed and authenticated locally:
  ```bash
  gcloud auth login
  gcloud config set project [YOUR_PROJECT_ID]
  ```

---

## 2. Enable Required APIs

Enable the necessary APIs for building, registry, and serverless hosting on GCP:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com
```

---

## 3. Database & Caching Setup

### A. Google Cloud SQL (PostgreSQL with pgvector)
1. Provision a PostgreSQL instance (v15 or higher) on Google Cloud SQL:
   ```bash
   gcloud sql instances create recruiter-os-db \
     --database-version=POSTGRES_15 \
     --tier=db-f1-micro \
     --region=us-central1
   ```
2. Create the production database:
   ```bash
   gcloud sql databases create recruiter_os --instance=recruiter-os-db
   ```
3. Set a strong password for the default `postgres` user:
   ```bash
   gcloud sql users set-password postgres \
     --instance=recruiter-os-db \
     --password=[YOUR_STRONG_PASSWORD]
   ```

### B. Google Cloud Memorystore (Redis)
1. Spin up a managed Redis instance in the same region:
   ```bash
   gcloud redis instances create recruiter-os-cache \
     --size=1 \
     --region=us-central1 \
     --redis-version=redis_7_0
   ```
2. Note the **IP Address** and **Port** output from this command.

---

## 4. Secret Manager Configuration

Store sensitive API credentials securely in Google Cloud Secret Manager so they can be injected into the backend container at runtime:

```bash
# Gemini API Key
echo -n "your-gemini-api-key" | gcloud secrets create GEMINI_API_KEY --data-file=-

# Database Credentials Connection String
echo -n "postgresql://postgres:[PASSWORD]@[CLOUDSQL_IP]:5432/recruiter_os" | gcloud secrets create DATABASE_URL --data-file=-

# Session and JWT Encryption Keys
echo -n "your-jwt-production-secret" | gcloud secrets create JWT_SECRET --data-file=-
echo -n "your-session-secret" | gcloud secrets create SESSION_SECRET --data-file=-
```

---

## 5. Google Cloud Build Deployment

RecruiterOS is preconfigured with a [cloudbuild.yaml](file:///c:/Mern/recuiterOS/cloudbuild.yaml) file at the root. Run the build pipeline directly from your local terminal:

```bash
gcloud builds submit --config cloudbuild.yaml .
```

This pipeline will:
1. Compile and containerize the backend Node.js microservice.
2. Compile and package the frontend React/Vite assets served via Nginx.
3. Push both images to the Google Container Registry.
4. Deploy the backend service to Cloud Run on port `8000`.
5. Deploy the frontend service to Cloud Run on port `80`.

---

## 6. Post-Deployment Settings

### A. Environment Variable Mapping (Backend)
After deploying, bind the secrets and env vars in your Cloud Run Backend service settings:
* `GEMINI_API_KEY`: Secret reference mapped to `GEMINI_API_KEY` secret.
* `DB_HOST` / `DB_PASSWORD`: SQL configuration values.
* `REDIS_HOST` / `REDIS_PORT`: IP/port configurations from Memorystore.
* `FRONTEND_URL`: The URL of your deployed Cloud Run Frontend service (binds CORS origin lock).

### B. Health Probe Verification
Verify that both services started successfully:
* **Backend health status**: `https://[BACKEND_CLOUD_RUN_URL]/health`
* **Vite application check**: `https://[FRONTEND_CLOUD_RUN_URL]/`
