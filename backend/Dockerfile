FROM continuumio/miniconda3

# Set working directory
WORKDIR /backend

# Copy environment + requirements and install
COPY environment.yml requirements.txt ./
RUN conda env create -f environment.yml && conda clean --all -y

# Use the conda env by default
ENV PATH="/opt/conda/envs/notoli_env/bin:$PATH" \
    DJANGO_SETTINGS_MODULE=backend.settings \
    PYTHONUNBUFFERED=1

# all commands below now use the conda env
SHELL ["conda", "run", "-n", "notoli_env", "/bin/bash", "-c"]

# Copy your Django project code
COPY . .

# Static Files
RUN python manage.py collectstatic --noinput

# App port
EXPOSE 8000

# Run Django server
CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "1"]
