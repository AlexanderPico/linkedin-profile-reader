# Parsing Performance Report: li

*Generated on 2025-07-01*

## 📊 Document Analysis
- **📄 Total text items extracted:** 84
- **📑 Pages processed:** 2
- **🔄 Page breaks normalized:** 2 removed
- **🗂️ Sections detected:** 8

## 🎯 Parsing Results by Section

### ✅ Basics Section
- **👤 Name:** ✅ Extracted
- **🏷️ Label:** ✅ Extracted
- **📍 Location:** ✅ Extracted
- **📧 Email:** ✅ Found
- **🔗 LinkedIn:** ✅ Found
- **📝 Summary:** ✅ 83 characters

### 💼 Work Experience
- **📈 Expected entries:** 8
- **📋 Entries parsed:** 8
- **✅ Success rate:** 100% (8/8)
- **Status:** ✅ Perfect

### 🎓 Education
- **📚 Expected entries:** 2
- **🏫 Entries parsed:** 2
- **✅ Success rate:** 100% (2/2)
- **Status:** ✅ Perfect

### 🛠️ Additional Sections
- **🔧 Skills:** 3 entries
- **🌐 Languages:** 0 entries
- **📚 Publications:** 6 entries
- **🏆 Awards:** 0 entries
- **📜 Certificates:** 0 entries

### 🔍 Section Details
#### Left Column Sections:
- **Contact:** 6 items
- **Skills:** 3 items
- **Publications:** 6 items
- **Patents:** 5 items

#### Right Column Sections:
- **basics:** 3 items
- **summary:** 3 items
- **experience:** 40 items
- **education:** 4 items

## 🎯 Overall Assessment

**📊 Overall Success Rate:** 100%

**🏆 Status:** ⚠️ CONTENT MISMATCH

### 💪 Strengths
- Complete basics extraction
- Skills successfully parsed
- Multi-page processing successful
- Page break normalization working

### ⚠️ Issues Identified
- Work section has content mismatches.
- Education section has content mismatches.
- Basics section has content mismatches.
### Work Section Diffs
```diff
- Expected
+ Received
      "name": "Amazon Web Services (AWS)",
      "position": "Head Of Science, HIL team",
      "startDate": "2021-04",
      "name": "Columbia University",
      "position": "Adjunct Professor",
      "startDate": "2012-01",
      "endDate": "2021-04",
      "name": "Amazon",
      "position": "Alexa AI",
      "startDate": "2020-03",
      "endDate": "2020-03",
      "location": "San Francisco, California",
      "name": "Scale AI",
      "position": "Head of Machine Learning",
      "startDate": "2019-06",
      "endDate": "2019-05",
      "location": "Fremont, California",
      "name": "Pony.ai",
      "position": "Chief Scientist",
      "startDate": "2018-05",
      "endDate": "2018-05",
-       "San Francisco",
+     "location": "San Francisco",
      "name": "Uber ATG",
      "position": "Perception team: deep learning, computer vision",
      "startDate": "2017-04",
      "endDate": "2017-04",
-       "Machine learning platform",
-       "Deep learning",
+       "Machine learning platform Deep learning",
      "location": "San Francisco Bay Area",
      "name": "Uber",
      "position": "Machine learning platform team",
      "startDate": "2015-08",
      "endDate": "2015-07",
        "Big data, machine learning, distributed systems, cloud and mobile computing, networking",
      "name": "Nokia Bell Labs",
      "position": "MTS",
      "startDate": "2001-08",
  ]
```

### Education Section Diffs
```diff
- Expected
+ Received
      "area": "Computer Science",
      "institution": "Cornell University",
      "studyType": "PhD",
-     "area": "Computer Vision",
+     "area": "'s degree, Computer Vision",
      "institution": "Chinese Academy of Sciences",
-     "studyType": "Master's degree",
+     "studyType": "Master",
  ]
```

### Basics Section Diffs
```diff
- Expected
+ Received
    "email": "erranli@gmail.com",
    "label": "AWS AI at Amazon | ACM Fellow | IEEE Fellow",
      "city": "San Francisco",
      "countryCode": "United States",
      "region": "California",
    "name": "LI Erran Li",
        "network": "LinkedIn",
-       "url": "https://www.linkedin.com/in/li-erran-li-552aa217",
-       "username": "li-erran-li-552aa217",
+       "url": "https://www.linkedin.com/in/li-erran-",
+       "username": "li-erran-",
    "summary": "Hiring scientists and engineers in ML, CV, and NLP. Please feel free to message me!",
  }
```


## 📈 Performance Rating

🏆 **PERFECT PARSING** - All sections successfully extracted!

---
*This report was automatically generated by the LinkedIn Profile Parser performance analysis tool.*
