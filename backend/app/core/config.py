from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str
    GOOGLE_API_KEY: str  # <-- Add this line
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()