# Textes officiels

Déposez ici les textes de loi (`.txt`, `.md` ou `.pdf`), puis redémarrez le backend.
Chaque texte est découpé par article (« Article 55 », « Art. 55 ») et l'assistant cite
l'article retrouvé sous chaque réponse.

Astuce : si la première ligne d'un fichier est `TITRE: Loi n° 25/62 du 31 décembre 2025`,
ce titre est utilisé dans les citations. Sinon, le nom du fichier sert de titre.
Nommez clairement les fichiers (ex. `loi-25-62-2025.pdf`, `loi-73-021-1973.pdf`).

## Textes à ajouter (par priorité)
1. **Loi n° 25/62 (réforme 2025)** : texte intégral au Journal officiel (plus de 300 articles
   selon la presse). Je ne l'ai pas trouvé en ligne : demandez-le au ministère des Affaires
   foncières ou au Journal officiel de la RDC.
2. **Loi n° 73-021 du 20 juillet 1973 modifiée par la loi n° 80-008** (version J.O. spécial du
   1er décembre 2004) : disponible sur WIPO Lex
   (https://www.wipo.int/wipolex/zh/text/492210) et sur leganet.cd.
3. Mesures d'exécution : ordonnances n° 74-148, 74-149 et 74-150 du 2 juillet 1974.
4. Utiles selon les questions : Constitution de 2006, Code de la famille, Code minier (loi
   n° 007-2002), Code forestier (loi n° 011/2002), loi n° 11/009 (agriculture).

Vérifiez que le PDF contient du texte sélectionnable (un PDF scanné nécessite un OCR).
Contrôle : http://localhost:5000/api/knowledge liste les textes chargés.
