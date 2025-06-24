from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer, util

app = Flask(__name__)
CORS(app)  

model = SentenceTransformer("all-MiniLM-L6-v2")

@app.route("/semantic-similarity", methods=["POST"])
def semantic_similarity():
    data = request.get_json()
    text1 = data.get("text1", "")
    text2 = data.get("text2", "")
    
    
    if not text1 or not text2:
        return jsonify({"error": "Missing input"}), 400
    
    embedding1 = model.encode(text1, convert_to_tensor=True)
    embedding2 = model.encode(text2, convert_to_tensor=True)
    similarity_score = util.cos_sim(embedding1, embedding2).item() * 100
    
    return jsonify({"similarity": round(similarity_score, 2)})

if __name__ == "__main__":
    app.run(debug=True)
