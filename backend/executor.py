# import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from vars import WORKFLOWS, JOBS
from typing import Optional
import pandas as pd 
from models import Block, BlockType
from executor_helper import enrich_one_row, find_email_one_row
import json 

def handle_block(block : Block, df: Optional[pd.DataFrame]):
    block_type = block.type
    block_params = block.parameters

    if block_type == BlockType.READ_CSV:
        fp = block_params.get("path")
        print(fp)
        if not fp:
            raise ValueError("READ_CSV block requires 'path' parameter")
        df = pd.read_csv(fp)
        return df

    if block_type == BlockType.MANUAL_ENRICH:
        name = block_params.get("name", "")
        company = block_params.get("company", "")
        company_location = block_params.get("company_location", "")
        linkedin = block_params.get("linkedin", "")
        
        if not name and not linkedin:
            raise ValueError("MANUAL_ENRICH requires at least 'name' or 'linkedin' parameter")
        
        row_dict = {
            "name": name,
            "company": company,
            "company_location": company_location,
            "linkedin": linkedin,
        }
        
        
        result = enrich_one_row(row_dict)
        
        output_row = {**row_dict}
        for k, v in result.items():
            col = f"found_{k}"
            if isinstance(v, (dict, list)):
                output_row[col] = json.dumps(v, ensure_ascii=False)
            else:
                output_row[col] = v
        
        df = pd.DataFrame([output_row])
        print(f"✅ Manual enrich complete. Columns: {df.columns.tolist()}")
        return df

    if block_type == BlockType.FILTER:
        if df is None:
            raise ValueError("FILTER block requires input DataFrame")

        column = block_params.get("column")
        op = block_params.get("op")
        value = block_params.get("value")

        if column is None or op is None:
            raise ValueError("Please enter a proper column/op parameter for FILTER block")
        if column not in df.columns:
            raise ValueError(f" '{column}' not found in dataframe (FILTER BLOCK)")

        series = df[column] 

        if op == "eq":
            mask = series == value
        elif op == "neq":
            mask = series != value
        elif op == "contains":
            mask = series.astype(str).str.contains(str(value), na=False)
        elif op == "not_contains":
            mask = ~series.astype(str).str.contains(str(value), na=False)
        else:
            raise ValueError(f"Unsupported FILTER op '{op}'")

        df = df[mask]
        return df

    if block_type == BlockType.EXPORT_CSV:
        output_path = block_params.get("output_path", "output.csv")
        if df is None:
            raise ValueError("No data to expect")
        print("EXPORTING TO ABS PATH:", output_path)
        df.to_csv(output_path, index=False)
        
        excel_path = output_path.rsplit('.', 1)[0] + '.xlsx'
        df.to_excel(excel_path, index=False, engine='openpyxl')
        print(f"Also exported to Excel: {excel_path}")
        
        return df

    if block_type == BlockType.LEAD_ENRICHMENT:
        if df is None:
            raise ValueError("LEAD_ENRICHMENT block requires input DataFrame")
       
        df = df.fillna('')
        df = df.reset_index(drop=True)
        records = df.to_dict(orient="records")

        print("\n\nRECORDS:", records)
        results_by_index: dict[int, dict] = {}

        with ThreadPoolExecutor(max_workers=20) as ex:
            futs = {
                ex.submit(enrich_one_row, rec): i
                for i, rec in enumerate(records)
            }
            for fut in as_completed(futs):
                i = futs[fut]
                try:
                    row_result = fut.result()
                    if row_result:
                        results_by_index[i] = row_result
                except Exception as e:
                    results_by_index[i] = {}  
                    print("Row", i, "error:", str(e))

        for i, row_result in results_by_index.items():
            for k, v in row_result.items():
                if isinstance(v, (dict, list, tuple)):
                    v = json.dumps(v, ensure_ascii=False)
                df.loc[i, k] = v

        # df = df[
        #     df.astype(str)
        #     .apply(lambda x: x.str.contains("Not publicly available", na=False))
        #     .any(axis=1)
        # ]
        print(df.head())

        return df
    if block_type == BlockType.FIND_EMAIL:
        if df is None:
            raise ValueError("FIND_EMAIL block requires input DataFrame")

        df = df.reset_index(drop=True)
        
        print("\n=== FIND_EMAIL BLOCK ===")
        print("DataFrame columns:", list(df.columns))
        print("DataFrame shape:", df.shape)
        print("First row sample:", df.iloc[0].to_dict() if len(df) > 0 else "Empty")

        records = df.to_dict(orient="records")
        print(f"Created {len(records)} records from dataframe")
        results_by_index: dict[int, dict] = {}

        with ThreadPoolExecutor(max_workers=15) as ex:
            futs = {
                ex.submit(find_email_one_row, rec, block_params.get("mode", "PERSONAL")): i
                for i, rec in enumerate(records)
            }
            for fut in as_completed(futs):
                i = futs[fut]
                try:
                    row_result = fut.result()
                    print(f"Row {i} result:", row_result)
                    if row_result:
                        results_by_index[i] = row_result
                except Exception as e:
                    print(f"❌ Row {i} error:", str(e))
                    results_by_index[i] = {}

        print("\n\nRESULTS BY INDEX:", results_by_index)
        for i, row_result in results_by_index.items():
            for k, v in row_result.items():
                if isinstance(v, (dict, list)):
                    df.loc[i, k] = str(v)
                else:
                    df.loc[i, k] = v

        
        return df
    

    raise ValueError(f"Unsupported block type: {block_type}")

def execute_workflow_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return

    JOBS[job_id] = job

    workflow = WORKFLOWS[job.workflow_id]
    num_blocks = max(len(workflow.blocks), 1)
    output_file_path = None

    try:
        for index, block in enumerate(workflow.blocks):
            df = handle_block(block, df if 'df' in locals() else None)
            
            if block.type == BlockType.EXPORT_CSV:
                csv_path = block.parameters.get("output_path", "output.csv")
                output_file_path = csv_path.rsplit('.', 1)[0] + '.xlsx'
            
            job = JOBS[job_id]
            job.progress = (index + 1) / num_blocks
            JOBS[job_id] = job
            print(f"Completed block {index + 1}/{num_blocks} for job {job_id}")

        if output_file_path:
            job = JOBS[job_id]
            job.output_file = output_file_path
            JOBS[job_id] = job

    except Exception as e:
        job = JOBS[job_id]
        job.error_message = str(e)
        JOBS[job_id] = job
        print("Job", job_id, "failed with error:", str(e))

    print("Job", job_id, "completed.")