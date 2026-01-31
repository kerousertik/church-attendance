"""
Production server for Church Attendance App
Optimized for cloud deployment (Render, Railway, etc.)
"""

from waitress import serve
from app import app
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
HOST = '0.0.0.0'
PORT = int(os.environ.get('PORT', 5000))
THREADS = int(os.environ.get('THREADS', 4))

if __name__ == '__main__':
    logger.info("=" * 50)
    logger.info("Church Attendance Server - Production Mode")
    logger.info("=" * 50)
    logger.info(f"Host: {HOST}")
    logger.info(f"Port: {PORT}")
    logger.info(f"Threads: {THREADS}")
    logger.info("=" * 50)
    
    # Serve the application
    logger.info(f"Serving on http://{HOST}:{PORT}")
    serve(app, host=HOST, port=PORT, threads=THREADS)
