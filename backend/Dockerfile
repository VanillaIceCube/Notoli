FROM continuumio/miniconda3

# Set working directory
WORKDIR /app

# Copy environment file and install
COPY environment.yml .
RUN conda env create -f environment.yml && conda clean --all -y

# Activate the environment
SHELL ["conda", "run", "-n", "notoli_env", "/bin/bash", "-c"]

# Copy your Django project code
COPY . .

# Run Django server
CMD ["conda", "run", "-n", "notoli_env", "python", "manage.py", "runserver", "0.0.0.0:8000"]