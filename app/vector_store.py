from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
import os

# Ensure persistent directory exists
PERSIST_DIRECTORY = os.getenv("CHROMA_PERSIST_DIRECTORY", "./chroma_db")
EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")

os.makedirs(PERSIST_DIRECTORY, exist_ok=True)

def get_vectorstore():
    embedding_function = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
    
    vectorstore = Chroma(
        collection_name="research_collection",
        embedding_function=embedding_function,
        persist_directory=PERSIST_DIRECTORY,
    )
    return vectorstore

async def add_documents(texts: list[str], metadatas: list[dict] = None, chat_id: str = None):
    vectorstore = get_vectorstore()
    if not texts:
        return
    
    # Split text into chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    
    # Enrich metadata with chat_id
    enriched_metadatas = []
    if metadatas:
        for m in metadatas:
            m['chat_id'] = chat_id
            enriched_metadatas.append(m)
    else:
        enriched_metadatas = [{'chat_id': chat_id} for _ in texts]
    
    # Create documents
    original_docs = [Document(page_content=t, metadata=m) for t, m in zip(texts, enriched_metadatas) if t.strip()]
    
    if not original_docs:
        print("--- ADD_DOCS: No documents created (empty content) ---")
        return

    # Split documents
    split_docs = text_splitter.split_documents(original_docs)
    split_docs = [d for d in split_docs if d.page_content.strip()]
    
    if not split_docs:
        print("--- ADD_DOCS: Text splitter resulted in empty docs ---")
        return
    
    print(f"--- ADD_DOCS: Adding {len(split_docs)} chunks to vector store for chat_id={chat_id} ---")
    vectorstore.add_documents(split_docs)

async def search_documents(query: str, chat_id: str = None, file_filter: list[str] = None, k: int = 4):
    # Strict Isolation: If no chat_id is provided, return no results.
    if not chat_id:
        return []

    vectorstore = get_vectorstore()
    
    # Base filter
    base_filter = {"chat_id": chat_id}
    
    # If explicit file filter is provided, use logic AND
    if file_filter:
        where_filter = {
            "$and": [
                {"chat_id": chat_id},
                {"source": {"$in": file_filter}}
            ]
        }
    else:
        where_filter = base_filter
        
    search_kwargs = {
        "k": k,
        "filter": where_filter
    }
        
    retriever = vectorstore.as_retriever(search_kwargs=search_kwargs)
    docs = await retriever.ainvoke(query)
    return [d.page_content for d in docs]

def delete_chat_documents(chat_id: str):
    vectorstore = get_vectorstore()
    try:
        vectorstore._collection.delete(where={"chat_id": chat_id})
    except Exception as e:
        print(f"Error deleting documents for chat {chat_id}: {e}")
