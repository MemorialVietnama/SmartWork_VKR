from app.use_cases.table_creation import TableCreationUseCase


def get_table_creation_use_case() -> TableCreationUseCase:
    return TableCreationUseCase()
